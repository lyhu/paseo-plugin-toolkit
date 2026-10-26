import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { paseoHome } from "../models/storage";

const execute = promisify(execFile);
export async function renameSession(agentId: string, title: string, signal: AbortSignal) {
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
    const listen = status.listen
      .replace(/^0\.0\.0\.0:/, "127.0.0.1:")
      .replace(/^\[::\]:/, "[::1]:");
    await execute(
      binary,
      ["--host", listen, "agent", "update", agentId, "--name", title, "--json"],
      options,
    );
  } catch {
    throw new Error("会话标题写回失败，请检查此 Host 的 Paseo CLI 与 daemon 连接。");
  }
}
