module.exports = {
  apps: [{
    name: "pdbot-webhook",
    script: "./dist/server.js",
    env: {
      NODE_ENV: "production",
      PORT: 8083
    }
  }]
}