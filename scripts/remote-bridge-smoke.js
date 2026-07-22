const { RemoteSshSession } = require("../remote/ssh-session");

async function main() {
  const session = new RemoteSshSession({
    host: process.env.TM_TEST_SSH_HOST,
    port: Number(process.env.TM_TEST_SSH_PORT) || 22,
    user: process.env.TM_TEST_SSH_USER,
    password: process.env.TM_TEST_SSH_PASSWORD,
    identityFile: process.env.TM_TEST_SSH_IDENTITY,
    remoteRoot: process.env.TM_TEST_REMOTE_ROOT,
  });
  const testPath = ".terminal-matrix-mcp-smoke.txt";
  try {
    const info = session.info();
    const listing = await session.list(".");
    const expected = `terminal-matrix-mcp-smoke-${Date.now()}\n`;
    await session.writeFile(testPath, expected, { mode: 0o600 });
    const readBack = await session.readFile(testPath);
    if (readBack.content !== expected) throw new Error("Remote write/read round trip failed");
    const command = await session.exec(`rm -f -- '${testPath}' && printf 'REMOTE_EXEC_OK'`);
    if (command.exitCode !== 0 || command.stdout !== "REMOTE_EXEC_OK") {
      throw new Error(`Remote exec failed: ${command.stderr || command.stdout}`);
    }
    console.log(
      JSON.stringify(
        {
          connection: info,
          listedEntries: listing.entries.length,
          writeReadBytes: readBack.size,
          exec: command.stdout,
          cleanup: "ok",
        },
        null,
        2
      )
    );
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
