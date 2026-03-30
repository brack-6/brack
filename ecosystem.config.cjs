module.exports = {
  apps: [{
    name: "brackoracle",
    script: "/home/brack/brackoracle/server.js",
    cwd: "/home/brack/brackoracle",
    env: {
      OLLAMA_MODEL: "gemma3:270m",
      OLLAMA_URL: "http://localhost:11434",
      BRACKORACLE_URL: "http://localhost:3100"
    }
  }]
}
