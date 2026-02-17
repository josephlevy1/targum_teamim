module.exports = {
  apps: [
    {
      name: "targum-web",
      cwd: "./apps/web",
      interpreter: "node",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 0.0.0.0",
      env: {
        NODE_ENV: "production",
      },
      // SQLite = single process only (no cluster mode)
      instances: 1,
      exec_mode: "fork",
      // Restart policy
      max_restarts: 10,
      restart_delay: 3000,
      // Logging
      out_file: "../../logs/pm2-out.log",
      error_file: "../../logs/pm2-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
