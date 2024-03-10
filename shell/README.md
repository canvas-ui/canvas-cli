# canvas-ui-shell

Canvas UI shell client (tested with bash)

## Installation

### Canvas bash client

```bash
$ git clone git@github.com:idncsk/canvas-ui-shell.git /path/to/canvas-shell
# Add canvas to your bashrc
$ echo ". /path/to/canvas-shell/context.sh" >> ~/.bashrc
# Edit your client config
$ nano ~/.canvas/config/jsonapi-client.json 
{
    "port": "8002"
}
```

Currently, we only support a very limited API used mainly for development/testing purposes

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
