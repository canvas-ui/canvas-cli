Lets start with the easier part

1) We should streamline our CLI interface to have a common pattern for all resources [remotes, contexts, workspaces, agents, roles]

The default addressing scheme used across all resources should be:
[user_or_team]@[remote-id]:[resource-id]/[optional-resource-path]

- Remotes are (for now) stored locally only, no API calls needed, index of remotes should be in ~/.canvas/config/remotes.index.json
  - remotes key: [user_or_team]@[remote-id]
- A index of contexts needs to be retrieved from each remote via /rest/v2/contexts and cached locally in ~/.canvas/config/contexts.index.json
  - contexts key: [user_or_team]@[remote-id]:context-id
- A list of workspaces needs to be retrieved from a remote via /rest/v2/workspaces and cached locally in ~/.canvas/config/workspaces.index.json
  - workspace key: [user_or_team]@[remote-id]:workspace-id

Agents: [user_or_team]@[remote-id]:universe/agent-id (for global agents)
        [user_or_team]@[remote-id]:workspace-id/agent-id (for workspace agents)
        Agents are not implemented yet

Roles: [user_or_team]@[remote-id]:universe/role-id (for global user-roles)
        [user_or_team]@[remote-id]:workspace-id/role-id (for workspace roles)
        Roles are not implemented yet

$ canvas remote add
should fetch the canvas-server version as well, we should display the remote server version instead of the description field

2) as using full resource paths may become cumbersome, we should support a simple aliases configuration stored in ~/.canvas/config/aliases.json

3) canvas-cli is bound to a single remote/specific context by default - in that case, for remote-local resources we can just use the resource names/ids instead of the full path, for example

$ canvas context bind test1 
instead of
$ canvas context bind user.name@remote.id:test1
$ canvas ws universe
instead of
$ canvas ws user@remote:universe
This is already implemented in some commands

--

4) The following list commands should be implemented
$ canvas remotes        # list all remotes
$ canvas remote list    # list all remotes
$ canvas remote         # shows current remote

$ canvas contexts       # list all contexts ()
$ canvas context list   # list all contexts
$ canvas context        # show current bound context
Create a alias "ctx" for context

$ canvas workspaces     # list all workspaces
$ canvas workspace list # list all workspaces
$ canvas workspace      # show current bound workspace based on the bound context 
Create a alias "ws" for workspace
4) The following list commands should be implemented
$ canvas remotes        # list all remotes
$ canvas remote list    # list all remotes
$ canvas remote         # shows current remote

$ canvas contexts       # list all contexts ()
$ canvas context list   # list all contexts
$ canvas context        # show current bound context
Create a alias "ctx" for context

$ canvas workspaces     # list all workspaces
$ canvas workspace list # list all workspaces
$ canvas workspace      # show current bound workspace based on the bound context
Create a alias "ws" for workspace


All list commands should contain user.name@remote.id in the first column

If a remote is bound and remote lastSynced is more than 15min ago, fetch the resources from remote and update local cache
The autoResync interval should be controlled via configuration and default to 5min, a sync command is already implemented (canvas remote <id> sync)


All list commands should contain user.name@remote.id in the first column

If a remote is bound and remote lastSynced is more than 15min ago, fetch the resources from remote and update local cache
The autoResync interval should be controlled via configuration and default to 5min, a sync command is already implemented (canvas remote <id> sync)

--

We'll be implementing a simple dotfile manager for our canvas-cli that uses git internally (a suitable git implementation) via the "dot" command/module. 
Dotfiles are stored in canvas workspaces and accessible through its fastify endpoints:
- /workspaces/:workspaceId/dotfiles/init - to initialize a repo
- /workspaces/:workspaceId/dotfiles/status - to check if a repo is initialized or not
- /workspaces/:workspaceId/dotfiles/git/ for direct access using git / canvas-cli
- /workspaces/:workspaceId/dotfiles/git/info/refs
- /workspaces/:workspaceId/dotfiles/git/git-upload-pack
- /workspaces/:workspaceId/dotfiles/git/git-receive-pack

Dotfiles shoud be synced to ~/.canvas/user.name@remote.id/<workspace.name>/dotfiles
Authentication uses canvas-server auth strategies - JWT and API tokens

A vanilla git command
git clone http://user:$ADMIN_TOKEN@127.0.0.1:8001/rest/v2/workspaces/universe/dotfiles/git/
works just fine, we need to internally do the same with some coordination

[CLI Interface]

$ dot init user.name@remote.id:workspace
- Fire a REST request to remotely initalize the repository

$ dot clone user.name@remote.id:workspace
- git clone to ~/.canvas/user.name@remote.id/workspace.name/dotfiles/

$ dot add ~/.bashrc user.name@remote.id:workspace.name/bashrc
or - since we have cli-session.json and are by default bound to a context/workspace
$ dot add ~/.bashrc workspace.name/bashrc
- copy ~/.bashrc to ~/.canvas/user.name@remote.id/workspace.name/dotfiles/bashrc
- Add entry to ~/.canvas/user.name@remote.id/workspace.name/dotfiles/some-index

$ dot commit user.name@remote.id:workspace.name # Whole repo
$ dot commit user.name@remote.id:workspace.name/bashr # single dotfile
$ dot push user.name@remote.id:workspace.name
$ dot list user@workspace
- We need to keep a local ~/.canvas/config/dotfiles.json index with key user.name@remote.id:workspace.name/dotfile so that when a user does dot list, he seems dotfiles from all remotes and workspaces
{
  "corpuser1@canvas.acmeorg:work/ssh": {
    "path": "~/.canvas/corpuser1@canvas.acmeorg/work/dotfiles/ssh",
    "status": "active",
    "files": [
      {"src": "~/.bashrc", "dst": "bashrc", "active": true}
    ]
  }
}


dot activate user@workspace/bashrc
    - Removes original file | move to backup?
    - Replace with symplink

dot deactivate user@workspace/bashrc
    - Replace symlink with file from repo
    
dot cd user@workspace (cd ~/.canvas/user.name/workspace.name/dotfiles)

We may have
- corpuser1@canvas.acmeorg:work/dotfiles/ssh
- corpuser2@canvas.acmeorg:work/dotfiles/ssh

Switching between these 2 dotfiles would then just require
$ canvas dot activate corpuser1@canvas.acmeorg:work/ssh
or as we are also exporting a "dot" wrapper
$ dot activate corpuser2@canvas.acmeorg:work/ssh

