import fs from 'node:fs';
import path from 'node:path';
import type { UnityProjectMode } from '../../store.js';
import {
  DESKLINK_UNITY_BOOTSTRAP_RELATIVE,
  DESKLINK_UNITY_CONFIG_RELATIVE,
  DESKLINK_UNITY_RESOLVE_RELATIVE
} from './unity-constants.js';

export type DeskLinkUnityBootstrapStatus = {
  installed: boolean;
  bootstrapPath: string;
  configPath: string;
};

const BOOTSTRAP_SOURCE = `#if UNITY_EDITOR
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

[InitializeOnLoad]
internal static class DeskLinkUnityMcpBootstrap
{
    private const double PollSeconds = 0.75;
    private static double _nextPoll;
    private static bool _transitioning;
    private static string _lastConfig = string.Empty;

    [Serializable]
    private sealed class Config
    {
        public string mode = "disabled";
        public int manualPid;
    }

    static DeskLinkUnityMcpBootstrap()
    {
        EditorApplication.update += Tick;
    }

    private static void Tick()
    {
        if (_transitioning || EditorApplication.timeSinceStartup < _nextPoll) return;
        _nextPoll = EditorApplication.timeSinceStartup + PollSeconds;
        TryResolveRequestedPackage();

        Config config = ReadConfig();
        int pid = Process.GetCurrentProcess().Id;
        bool shouldRun = string.Equals(config.mode, "auto", StringComparison.OrdinalIgnoreCase)
            || (string.Equals(config.mode, "manual", StringComparison.OrdinalIgnoreCase)
                && config.manualPid == pid);

        if (FindType("MCPForUnity.Editor.Services.MCPServiceLocator") == null) return;

        string signature = config.mode + ":" + config.manualPid;
        if (signature == _lastConfig && TransportMatches(shouldRun)) return;
        _lastConfig = signature;
        _ = ApplyAsync(shouldRun);
    }

    private static void TryResolveRequestedPackage()
    {
        try
        {
            string root = Path.GetDirectoryName(Application.dataPath) ?? string.Empty;
            string requestFile = Path.Combine(root, "ProjectSettings", "DeskLinkUnityMcpResolve.request");
            if (!File.Exists(requestFile)) return;

            Client.Resolve();
            File.Delete(requestFile);
            UnityEngine.Debug.Log("[DeskLink] Requested Unity Package Manager resolve.");
        }
        catch (Exception ex)
        {
            UnityEngine.Debug.LogWarning("[DeskLink] Could not request Package Manager resolve: " + ex.Message);
        }
    }

    private static Config ReadConfig()
    {
        try
        {
            string root = Path.GetDirectoryName(Application.dataPath) ?? string.Empty;
            string file = Path.Combine(root, "ProjectSettings", "DeskLinkUnityMcp.json");
            if (!File.Exists(file)) return new Config();
            return JsonUtility.FromJson<Config>(File.ReadAllText(file)) ?? new Config();
        }
        catch (Exception ex)
        {
            UnityEngine.Debug.LogWarning("[DeskLink] Could not read Unity MCP config: " + ex.Message);
            return new Config();
        }
    }

    private static bool TransportMatches(bool shouldRun)
    {
        try
        {
            object manager = GetTransportManager();
            Type modeType = GetTransportModeType();
            object stdio = Enum.Parse(modeType, "Stdio");
            object http = Enum.Parse(modeType, "Http");
            MethodInfo isRunning = manager.GetType().GetMethod("IsRunning")
                ?? throw new MissingMethodException("TransportManager.IsRunning");
            bool stdioRunning = (bool)isRunning.Invoke(manager, new[] { stdio });
            bool httpRunning = (bool)isRunning.Invoke(manager, new[] { http });
            return shouldRun ? stdioRunning && !httpRunning : !stdioRunning;
        }
        catch
        {
            // If MCP for Unity is not loaded, "stopped" already matches a disabled/manual config.
            return !shouldRun;
        }
    }
    private static async Task ApplyAsync(bool shouldRun)
    {
        _transitioning = true;
        try
        {
            object manager = GetTransportManager();
            Type modeType = GetTransportModeType();
            object stdio = Enum.Parse(modeType, "Stdio");
            object http = Enum.Parse(modeType, "Http");
            Type managerType = manager.GetType();
            MethodInfo isRunning = managerType.GetMethod("IsRunning")
                ?? throw new MissingMethodException("TransportManager.IsRunning");
            MethodInfo start = managerType.GetMethod("StartAsync")
                ?? throw new MissingMethodException("TransportManager.StartAsync");
            MethodInfo stop = managerType.GetMethod("StopAsync")
                ?? throw new MissingMethodException("TransportManager.StopAsync");

            if (shouldRun)
            {
                if ((bool)isRunning.Invoke(manager, new[] { http }))
                    await (Task)stop.Invoke(manager, new[] { http });
                if (!(bool)isRunning.Invoke(manager, new[] { stdio }))
                    await (Task)start.Invoke(manager, new[] { stdio });
            }
            else if ((bool)isRunning.Invoke(manager, new[] { stdio }))
            {
                await (Task)stop.Invoke(manager, new[] { stdio });
            }
        }
        catch (Exception ex)
        {
            UnityEngine.Debug.LogWarning("[DeskLink] Could not update MCP for Unity transport: " + ex.GetBaseException().Message);
        }
        finally
        {
            _transitioning = false;
        }
    }

    private static object GetTransportManager()
    {
        Type locator = FindType("MCPForUnity.Editor.Services.MCPServiceLocator")
            ?? throw new TypeLoadException("MCPServiceLocator is unavailable");
        PropertyInfo property = locator.GetProperty("TransportManager", BindingFlags.Public | BindingFlags.Static)
            ?? throw new MissingMemberException("MCPServiceLocator.TransportManager");
        return property.GetValue(null) ?? throw new InvalidOperationException("TransportManager is unavailable");
    }

    private static Type GetTransportModeType()
    {
        return FindType("MCPForUnity.Editor.Services.Transport.TransportMode")
            ?? throw new TypeLoadException("TransportMode is unavailable");
    }

    private static Type FindType(string fullName)
    {
        foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            Type type = assembly.GetType(fullName, false);
            if (type != null) return type;
        }
        return null;
    }
}
#endif
`;

function bootstrapPath(projectPath: string): string {
  return path.join(projectPath, ...DESKLINK_UNITY_BOOTSTRAP_RELATIVE.split('/'));
}

function configPath(projectPath: string): string {
  return path.join(projectPath, ...DESKLINK_UNITY_CONFIG_RELATIVE.split('/'));
}

function resolveRequestPath(projectPath: string): string {
  return path.join(projectPath, ...DESKLINK_UNITY_RESOLVE_RELATIVE.split('/'));
}

export function inspectDeskLinkUnityBootstrap(projectPath: string): DeskLinkUnityBootstrapStatus {
  const script = bootstrapPath(projectPath);
  return {
    installed: fs.existsSync(script),
    bootstrapPath: script,
    configPath: configPath(projectPath)
  };
}

export function installDeskLinkUnityBootstrap(projectPath: string): DeskLinkUnityBootstrapStatus {
  const script = bootstrapPath(projectPath);
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, BOOTSTRAP_SOURCE, 'utf8');
  return inspectDeskLinkUnityBootstrap(projectPath);
}
export function requestDeskLinkUnityResolve(projectPath: string): void {
  const file = resolveRequestPath(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(Date.now()), 'utf8');
}

export function writeDeskLinkUnityConfig(
  projectPath: string,
  mode: UnityProjectMode,
  manualPid = 0
): void {
  const file = configPath(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mode, manualPid }, null, 2) + '\n', 'utf8');
}
