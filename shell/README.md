# canvas-ui-shell

Canvas UI shell client (tested with bash)

## Installation

### Canvas bash client

```bash
$ git clone https://github.com/canvas-ai/canvas-shell.git /path/to/canvas-shell
# Add canvas to your bashrc
$ echo ". /path/to/canvas-shell/context.sh" >> ~/.bashrc
# Edit your client config
$ mkdir -p ~/.canvas/config
$ nano ~/.canvas/config/client.json
{
    "transports": {
        "rest": {
            "protocol": "http",
            "host": "127.0.0.1",
            "port": 8000,            
            "baseUrl": "/rest/v1",
            "auth": {
                "enabled": true,
                "user": "",
                "password": "",
                "token": "your-canvas-app-token"
            }
        },
        "socketio": {
            "protocol": "http",
            "host": "127.0.0.1",
            "port": 8000,
            "auth": {
                "enabled": true,
                "user": "",
                "password": "",
                "token": "your-canvas-app-token"
            }
        }
    }
}
# If client.json is missing, the following defaults will be used:
# protocol http
# host 127.0.0.1
# port 8000
# baseUrl /rest/v1
# auth.token canvas-server-token
```

Currently, we only support a very limited API used mainly for development/testing purposes (always check --help, this readme may not be up-to-date)

- set: Sets a context URL
- url: Returns the current context url
- path: Returns the current context path
- paths: Returns the path representation of the current context tree
- tree: Returns the full Canvas context tree in plain JSON format
- bitmaps: Returns a summary of all in-memory bitmaps for the current context
- list: Lists all documents linked to the current context    
  - tabs: data/abstraction/tab
  - notes: data/abstraction/note
  - todo: data/abstraction/todo
- sessions: {list, set, create}: If you want to bind your terminal to a specific session (like "work" with base url /work/customer-foo)
