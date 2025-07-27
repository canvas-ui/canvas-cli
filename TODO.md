We should streamline our CLI interface to have a common pattern for all resources [remotes, contexts, workspaces, agents, roles]

The default addressing scheme used across all core endpoints should be
[user_or_team]@[remote-id]:[resource-id]/[optional-resource-path]

Remotes: [user_or_team]@[remote-id]
Contexts: [user_or_team]@[remote-id]:context-id
Worksapces: [user_or_team]@[remote-id]:workspace-id
Agents: [user_or_team]@[remote-id]:universe/agent-id (for global agents)
        [user_or_team]@[remote-id]:workspace-id/agent-id (for workspace agents)        
Roles: [user_or_team]@[remote-id]:universe/role-id (for global user-roles)
        [user_or_team]@[remote-id]:workspace-id/role-id (for workspace roles)
Dotfiles: [user_or_team]@[remote-id]:workspace-id/dotfile-id (work/shell or acmeorg-ws/ssh)


canvas remotes        # list all remotes  
canvas remote list    # list all remotes
canvas remote set <remote-id>  ..
canvas remote get   # or just `canvas remote` to show current  


canvas workspace list # list all workspaces  
canvas workspaces     # list all workspaces  

canvas context        # show the current bound context as per cli-session.json
canvas contexts       # list all contexts  
canvas context list   # list all contexts

canvas roles          # list all roles  
canvas agents         # list all agents  

canvas q <agent.id>   # 
canvas hi <agent.id>  # canvas hi lucy did we get any emails for that china project yesterday?

All list commands should contain user.name@remote.id as the first column


canvas remote add should fetch the canvas-server version as well, we should display it instead of the description field
