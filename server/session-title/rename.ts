import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { paseoHome } from "../models/storage";
import { TITLE_MESSAGES, TitleFailureError } from "./errors";

const execute = promisify(execFile);
let cachedListen: { address: string; home: string; expiresAt: number } | null = null;

export function clearListenCache() {
  cachedListen = null;
}

export async function localAgentCommand(args: string[], signal: AbortSignal) {
  const home = paseoHome();
  const binary =
    process.platform === "darwin" &&
    existsSync("/Applications/Paseo.app/Contents/Resources/bin/paseo")
      ? "/Applications/Paseo.app/Contents/Resources/bin/paseo"
      : "paseo";
  const options = {
    timeout: 20000,
    maxBuffer: 1024 * 1024,
    signal,
    env: { ...process.env, PASEO_HOME: home, PASEO_HOST: "" },
  };
  try {
    let listen =
      cachedListen && cachedListen.home === home && cachedListen.expiresAt > Date.now()
        ? cachedListen.address
        : null;
    if (!listen) {
      const { stdout } = await execute(
        binary,
        ["--home", home, "daemon", "status", "--json"],
        options,
      );
      const status = JSON.parse(stdout) as {
        home?: string;
        listen?: string;
        connectedDaemon?: string;
      };
      if (status.home !== home || !status.listen || status.connectedDaemon !== "reachable")
        throw new Error("daemon");
      // Use the status-reported local address, never the user's selected remote CLI target.
      listen = status.listen.replace(/^0\.0\.0\.0:/, "127.0.0.1:").replace(/^\[::\]:/, "[::1]:");
      cachedListen = { address: listen, home, expiresAt: Date.now() + 60000 };
    }
    const result = await execute(binary, ["--host", listen, "agent", ...args, "--json"], options);
    return JSON.parse(result.stdout) as unknown;
  } catch (error) {
    cachedListen = null;
    throw new TitleFailureError("paseo.commandFailed", TITLE_MESSAGES.commandFailed, {
      cause: error,
    });
  }
}
export async function renameSession(agentId: string, title: string, signal: AbortSignal) {
  try {
    await localAgentCommand(["update", agentId, "--name", title], signal);
  } catch (error) {
    throw new TitleFailureError("paseo.writeFailed", TITLE_MESSAGES.writeFailed, { cause: error });
  }
}
