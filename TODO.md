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



Dotfiles: [user_or_team]@[remote-id]:workspace-id/dotfile-id (work/shell or acmeorg-ws/ssh)


canvas remote set <remote-id>  ..
canvas remote get   # or just `canvas remote` to show current  


canvas context        # show the current bound context as per cli-session.json


canvas roles          # list all roles  
canvas agents         # list all agents  

canvas q <agent.id>   # 
canvas hi <agent.id>  # canvas hi lucy did we get any emails for that china project yesterday?





