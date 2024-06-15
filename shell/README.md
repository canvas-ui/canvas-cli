# canvas-ui-shell

Canvas UI shell client (tested with bash)

## Installation

### Canvas bash client

```bash
$ git clone git@github.com:idncsk/canvas-ui-shell.git /path/to/canvas-shell
# Add canvas to your bashrc
$ echo ". /path/to/canvas-shell/context.sh" >> ~/.bashrc
# Edit your client config
$ mkdir -p ~/.canvas/config
# For remote instances
$ nano ~/.canvas/config/transports.rest.json
{
    "protocol": "https",
    "host": "canvas.domain.tld",
    "port": "443",
    "baseUrl": "/rest/v1",
    "auth": {
        "token": "canvas-server-token"
    }
}
# If you create an empty file, the following defaults will be used:
# port 8000
# host 127.0.0.1
# protocol http
# baseUrl /rest/v1
# auth.token canvas-server-token
```

Currently, we only support a very limited API used mainly for development/testing purposes (always check --help, readme may not be up-to-date)

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
