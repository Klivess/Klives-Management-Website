/*
 * Every permission the backend defines (generated from the backend's per-service Perms.cs
 * files). The e2e mocks build `/KMProfiles/me` and the catalog from it,
 * so the site is exercised against the real key set.
 */

export interface FixturePermission {
  key: string;
  service: string;
  serviceKey: string;
  area: string;
  tier: 'Glance' | 'Read' | 'Act' | 'Manage' | 'Critical';
  tierValue: number;
  title: string;
  description: string;
  /** The retired rank that could use it (migration grants it to every profile at or above). */
  legacyRank: number;
  implies: string[];
  sensitive: boolean;
}

export const PERMISSIONS: FixturePermission[] = [
  {
    "key": "profiles.directory.view",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Directory",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View the profile directory",
    "description": "List profiles with their rank, status and whether they are online.",
    "legacyRank": 3,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "profiles.permissions.view",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Permissions",
    "tier": "Read",
    "tierValue": 2,
    "title": "View permissions",
    "description": "See the permission catalog, the routes each permission unlocks and every profile's grants.",
    "legacyRank": 4,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": false
  },
  {
    "key": "profiles.activity.read",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Activity",
    "tier": "Read",
    "tierValue": 2,
    "title": "View profile activity",
    "description": "Request history, page views, logins and denials of other profiles.",
    "legacyRank": 5,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": true
  },
  {
    "key": "profiles.activity.live",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Activity",
    "tier": "Read",
    "tierValue": 2,
    "title": "Watch profiles live",
    "description": "Follow what another profile is doing right now: current page and live requests.",
    "legacyRank": 5,
    "implies": [
      "profiles.activity.read"
    ],
    "sensitive": true
  },
  {
    "key": "profiles.lifecycle.create",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Lifecycle",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Create profiles",
    "description": "Create new profiles ranked below your own.",
    "legacyRank": 3,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": false
  },
  {
    "key": "profiles.lifecycle.edit",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Lifecycle",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Edit profiles",
    "description": "Rename profiles, change their Discord ID and set their rank (below your own).",
    "legacyRank": 4,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": false
  },
  {
    "key": "profiles.permissions.grant",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Permissions",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Grant and revoke permissions",
    "description": "Change what other profiles may do. Only the owner can hand this out.",
    "legacyRank": 5,
    "implies": [
      "profiles.permissions.view"
    ],
    "sensitive": false
  },
  {
    "key": "profiles.access.control",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Access control",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Control profile access live",
    "description": "Suspend profiles, make them read-only, turn login off and sign out their sessions.",
    "legacyRank": 4,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": false
  },
  {
    "key": "profiles.credentials.reset",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Credentials",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Reset passwords",
    "description": "Set a new password for another profile (signs out their sessions).",
    "legacyRank": 5,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": true
  },
  {
    "key": "profiles.lifecycle.delete",
    "service": "Profiles",
    "serviceKey": "profiles",
    "area": "Lifecycle",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Delete profiles",
    "description": "Permanently delete a profile and end its sessions.",
    "legacyRank": 5,
    "implies": [
      "profiles.directory.view"
    ],
    "sensitive": false
  },
  {
    "key": "system.status.view",
    "service": "System",
    "serviceKey": "system",
    "area": "Status",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View system status",
    "description": "Front-page statistics and API request statistics.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.uptime.view",
    "service": "System",
    "serviceKey": "system",
    "area": "Status",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View uptime history",
    "description": "Service uptime and outage history.",
    "legacyRank": 4,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.resources.read",
    "service": "System",
    "serviceKey": "system",
    "area": "Resources",
    "tier": "Read",
    "tierValue": 2,
    "title": "View host resources",
    "description": "Hardware, running services, processes and browser instances.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.logs.read",
    "service": "System",
    "serviceKey": "system",
    "area": "Logs",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read service logs",
    "description": "The live service log and its summaries.",
    "legacyRank": 4,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.scheduler.read",
    "service": "System",
    "serviceKey": "system",
    "area": "Scheduler",
    "tier": "Read",
    "tierValue": 2,
    "title": "View scheduled tasks",
    "description": "Every task waiting in the time manager.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.scheduler.run",
    "service": "System",
    "serviceKey": "system",
    "area": "Scheduler",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Fire scheduled tasks early",
    "description": "Run a scheduled task now instead of at its due time.",
    "legacyRank": 3,
    "implies": [
      "system.scheduler.read"
    ],
    "sensitive": false
  },
  {
    "key": "system.services.control",
    "service": "System",
    "serviceKey": "system",
    "area": "Services",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Restart and stop services",
    "description": "Restart or terminate any running service.",
    "legacyRank": 5,
    "implies": [
      "system.resources.read"
    ],
    "sensitive": false
  },
  {
    "key": "system.update.deploy",
    "service": "System",
    "serviceKey": "system",
    "area": "Services",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Update Omnipotent",
    "description": "Pull and deploy a new build of the whole system.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.terminal.use",
    "service": "System",
    "serviceKey": "system",
    "area": "Host",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Use the host terminal",
    "description": "Run shell commands on the server.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "system.hostcontrol.view",
    "service": "System",
    "serviceKey": "system",
    "area": "Host",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Watch the host screen",
    "description": "Live video of the server's desktop.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "system.hostcontrol.use",
    "service": "System",
    "serviceKey": "system",
    "area": "Host",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Control the host desktop",
    "description": "Send mouse and keyboard input to the server's desktop.",
    "legacyRank": 5,
    "implies": [
      "system.hostcontrol.view"
    ],
    "sensitive": true
  },
  {
    "key": "system.portforwarding.read",
    "service": "System",
    "serviceKey": "system",
    "area": "Network",
    "tier": "Read",
    "tierValue": 2,
    "title": "View port forwarding",
    "description": "UPnP port mappings on the router.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.portforwarding.manage",
    "service": "System",
    "serviceKey": "system",
    "area": "Network",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Change port forwarding",
    "description": "Add, edit and delete router port mappings.",
    "legacyRank": 5,
    "implies": [
      "system.portforwarding.read"
    ],
    "sensitive": false
  },
  {
    "key": "system.settings.read",
    "service": "System",
    "serviceKey": "system",
    "area": "Settings",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Read system settings",
    "description": "Every OmniSetting, including secrets when revealed.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "system.settings.write",
    "service": "System",
    "serviceKey": "system",
    "area": "Settings",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Change system settings",
    "description": "Create, change and delete OmniSettings.",
    "legacyRank": 5,
    "implies": [
      "system.settings.read"
    ],
    "sensitive": true
  },
  {
    "key": "system.api.routes.read",
    "service": "System",
    "serviceKey": "system",
    "area": "API",
    "tier": "Read",
    "tierValue": 2,
    "title": "List API routes",
    "description": "Every registered route with its method and permission.",
    "legacyRank": 3,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.api.telemetry.read",
    "service": "System",
    "serviceKey": "system",
    "area": "API",
    "tier": "Read",
    "tierValue": 2,
    "title": "View API telemetry",
    "description": "Latency, traffic, traces and client timings for every route.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "system.api.cache.manage",
    "service": "System",
    "serviceKey": "system",
    "area": "API",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage the response cache",
    "description": "Read cache statistics and clear the response cache.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "accounts.registry.read",
    "service": "Account Registry",
    "serviceKey": "accounts",
    "area": "Accounts",
    "tier": "Read",
    "tierValue": 2,
    "title": "View agent accounts",
    "description": "Accounts agents created on external sites (secrets stay masked).",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "accounts.secrets.reveal",
    "service": "Account Registry",
    "serviceKey": "accounts",
    "area": "Accounts",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Reveal account secrets",
    "description": "Show the decrypted passwords and tokens of agent accounts.",
    "legacyRank": 5,
    "implies": [
      "accounts.registry.read"
    ],
    "sensitive": true
  },
  {
    "key": "accounts.registry.manage",
    "service": "Account Registry",
    "serviceKey": "accounts",
    "area": "Accounts",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Edit agent accounts",
    "description": "Update and delete accounts in the registry.",
    "legacyRank": 5,
    "implies": [
      "accounts.registry.read"
    ],
    "sensitive": true
  },
  {
    "key": "cs2.status.view",
    "service": "CS2 Arbitrage",
    "serviceKey": "cs2",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View bot status",
    "description": "Whether the arbitrage engine is running and how it is doing.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "cs2.scans.read",
    "service": "CS2 Arbitrage",
    "serviceKey": "cs2",
    "area": "Scans",
    "tier": "Read",
    "tierValue": 2,
    "title": "View scans and opportunities",
    "description": "Scan analytics, results, opportunities, the liquidity plan and balance history.",
    "legacyRank": 1,
    "implies": [
      "cs2.status.view"
    ],
    "sensitive": false
  },
  {
    "key": "cs2.scans.run",
    "service": "CS2 Arbitrage",
    "serviceKey": "cs2",
    "area": "Scans",
    "tier": "Act",
    "tierValue": 3,
    "title": "Trigger scans",
    "description": "Ask the engine to scan the market now.",
    "legacyRank": 2,
    "implies": [
      "cs2.scans.read"
    ],
    "sensitive": false
  },
  {
    "key": "kliveagent.status.view",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View agent status",
    "description": "Whether the agent is busy, its computer and usage summaries.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "kliveagent.history.read",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "History",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read agent history",
    "description": "Conversations, runs, tasks, jobs, notifications, tools and attachments.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.status.view"
    ],
    "sensitive": true
  },
  {
    "key": "kliveagent.chat.use",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Chat",
    "tier": "Act",
    "tierValue": 3,
    "title": "Chat with the agent",
    "description": "Send messages, steer, cancel and approve runs, resolve handoffs and upload attachments.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.history.read"
    ],
    "sensitive": false
  },
  {
    "key": "kliveagent.jobs.manage",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Jobs",
    "tier": "Act",
    "tierValue": 3,
    "title": "Manage agent jobs",
    "description": "Create, steer, stop and resume background jobs and cancel tasks.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.history.read"
    ],
    "sensitive": false
  },
  {
    "key": "kliveagent.memories.read",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Memory",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read agent memory",
    "description": "Everything the agent remembers.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "kliveagent.memories.manage",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Memory",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Edit agent memory",
    "description": "Add and delete agent memories.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.memories.read"
    ],
    "sensitive": false
  },
  {
    "key": "kliveagent.index.rebuild",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Memory",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Rebuild the agent index",
    "description": "Re-index the agent's knowledge.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "kliveagent.capabilities.execute",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Capabilities",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Run agent capabilities",
    "description": "Invoke agent capabilities directly.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.history.read"
    ],
    "sensitive": false
  },
  {
    "key": "kliveagent.capabilities.elevated",
    "service": "KliveAgent",
    "serviceKey": "kliveagent",
    "area": "Capabilities",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Run elevated capabilities",
    "description": "Invoke capabilities that need elevated permissions.",
    "legacyRank": 5,
    "implies": [
      "kliveagent.capabilities.execute"
    ],
    "sensitive": false
  },
  {
    "key": "klivechat.rooms.manage",
    "service": "KliveChat",
    "serviceKey": "klivechat",
    "area": "Rooms",
    "tier": "Act",
    "tierValue": 3,
    "title": "Create and delete rooms",
    "description": "Create chat rooms and delete rooms you created.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivechat.rooms.moderate",
    "service": "KliveChat",
    "serviceKey": "klivechat",
    "area": "Rooms",
    "tier": "Act",
    "tierValue": 3,
    "title": "Moderate rooms",
    "description": "Mute and remove people ranked below you in chat rooms.",
    "legacyRank": 3,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivechat.rooms.delete-any",
    "service": "KliveChat",
    "serviceKey": "klivechat",
    "area": "Rooms",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Delete any room",
    "description": "Delete chat rooms other people created.",
    "legacyRank": 4,
    "implies": [
      "klivechat.rooms.manage"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.drive.view",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Drive",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View drive capacity",
    "description": "How much of the cloud drive is used and free.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.browse",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Read",
    "tierValue": 2,
    "title": "Browse files",
    "description": "List folders and files shared with you, with previews.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.drive.view"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.download",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Read",
    "tierValue": 2,
    "title": "Download files",
    "description": "Download and stream files shared with you.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.files.browse"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.upload",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Act",
    "tierValue": 3,
    "title": "Upload files",
    "description": "Upload files and create folders where you are an editor.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.files.browse"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.organize",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Act",
    "tierValue": 3,
    "title": "Move files",
    "description": "Move items between folders where you are an editor.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.files.browse"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.delete",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Delete files",
    "description": "Delete items where you are an editor, including everything inside folders.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.files.browse"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.sharing.manage",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Sharing",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Share files",
    "description": "Choose who can access items you edit, and create public share links.",
    "legacyRank": 1,
    "implies": [
      "klivecloud.files.browse"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.sharing.manage-any",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Sharing",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage anyone's share links",
    "description": "List, change and delete share links other profiles created.",
    "legacyRank": 4,
    "implies": [
      "klivecloud.sharing.manage"
    ],
    "sensitive": false
  },
  {
    "key": "klivecloud.files.all",
    "service": "KliveCloud",
    "serviceKey": "klivecloud",
    "area": "Files",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Access every file",
    "description": "Ignore access lists: see and edit every item in KliveCloud.",
    "legacyRank": 5,
    "implies": [
      "klivecloud.files.download",
      "klivecloud.files.upload",
      "klivecloud.files.organize",
      "klivecloud.files.delete",
      "klivecloud.sharing.manage-any"
    ],
    "sensitive": true
  },
  {
    "key": "klivegames.servers.read",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Servers",
    "tier": "Read",
    "tierValue": 2,
    "title": "View game servers",
    "description": "Games, versions, servers, players, backups, configuration and file listings.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivegames.servers.operate",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Servers",
    "tier": "Act",
    "tierValue": 3,
    "title": "Operate game servers",
    "description": "Start, stop and restart servers and act on players.",
    "legacyRank": 5,
    "implies": [
      "klivegames.servers.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivegames.console.use",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Console",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Use server consoles",
    "description": "Send console commands and watch the live console.",
    "legacyRank": 5,
    "implies": [
      "klivegames.servers.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivegames.servers.manage",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Servers",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage game servers",
    "description": "Create, kill and delete servers, change configuration, networking and backups.",
    "legacyRank": 5,
    "implies": [
      "klivegames.servers.operate"
    ],
    "sensitive": false
  },
  {
    "key": "klivegames.files.read",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Files",
    "tier": "Read",
    "tierValue": 2,
    "title": "Download server files",
    "description": "Download server files and backups.",
    "legacyRank": 5,
    "implies": [
      "klivegames.servers.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivegames.files.write",
    "service": "KliveGames",
    "serviceKey": "klivegames",
    "area": "Files",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Edit server files",
    "description": "Upload, edit and delete server files.",
    "legacyRank": 5,
    "implies": [
      "klivegames.files.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivelink.agents.view",
    "service": "KliveLink",
    "serviceKey": "klivelink",
    "area": "Agents",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View connected computers",
    "description": "Which remote computers are connected and their status.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivelink.agents.inspect",
    "service": "KliveLink",
    "serviceKey": "klivelink",
    "area": "Agents",
    "tier": "Read",
    "tierValue": 2,
    "title": "Inspect computers",
    "description": "System information, running processes and directory listings.",
    "legacyRank": 5,
    "implies": [
      "klivelink.agents.view"
    ],
    "sensitive": true
  },
  {
    "key": "klivelink.agents.files",
    "service": "KliveLink",
    "serviceKey": "klivelink",
    "area": "Files",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Transfer files",
    "description": "Download files from and upload files to remote computers.",
    "legacyRank": 5,
    "implies": [
      "klivelink.agents.inspect"
    ],
    "sensitive": true
  },
  {
    "key": "klivelink.agents.control",
    "service": "KliveLink",
    "serviceKey": "klivelink",
    "area": "Control",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Control computers",
    "description": "Run processes and terminal commands, kill processes, watch the screen and disconnect.",
    "legacyRank": 5,
    "implies": [
      "klivelink.agents.inspect"
    ],
    "sensitive": true
  },
  {
    "key": "klivelink.agents.destroy",
    "service": "KliveLink",
    "serviceKey": "klivelink",
    "area": "Control",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Uninstall agents",
    "description": "Tell a remote agent to remove itself.",
    "legacyRank": 5,
    "implies": [
      "klivelink.agents.view"
    ],
    "sensitive": false
  },
  {
    "key": "klivemail.overview.view",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View mail statistics",
    "description": "Message and mailbox counts.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivemail.mailboxes.read",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Mailboxes",
    "tier": "Read",
    "tierValue": 2,
    "title": "View mailboxes",
    "description": "Every mailbox address.",
    "legacyRank": 5,
    "implies": [
      "klivemail.overview.view"
    ],
    "sensitive": false
  },
  {
    "key": "klivemail.messages.read",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Messages",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read mail",
    "description": "Messages, search and attachments.",
    "legacyRank": 5,
    "implies": [
      "klivemail.mailboxes.read"
    ],
    "sensitive": true
  },
  {
    "key": "klivemail.messages.act",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Messages",
    "tier": "Act",
    "tierValue": 3,
    "title": "Mark mail read or unread",
    "description": "Change a message's read state.",
    "legacyRank": 5,
    "implies": [
      "klivemail.messages.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivemail.messages.delete",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Messages",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Delete mail",
    "description": "Delete messages.",
    "legacyRank": 5,
    "implies": [
      "klivemail.messages.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivemail.mailboxes.manage",
    "service": "KliveMail",
    "serviceKey": "klivemail",
    "area": "Mailboxes",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage mailboxes",
    "description": "Create and delete mailboxes.",
    "legacyRank": 5,
    "implies": [
      "klivemail.mailboxes.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivetools.catalog.view",
    "service": "KliveTools",
    "serviceKey": "klivetools",
    "area": "Tools",
    "tier": "Read",
    "tierValue": 2,
    "title": "View tools and jobs",
    "description": "The tool catalog, each tool's live state and job history.",
    "legacyRank": 4,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivetools.jobs.cancel",
    "service": "KliveTools",
    "serviceKey": "klivetools",
    "area": "Tools",
    "tier": "Act",
    "tierValue": 3,
    "title": "Cancel tool jobs",
    "description": "Stop running tool jobs.",
    "legacyRank": 4,
    "implies": [
      "klivetools.catalog.view"
    ],
    "sensitive": false
  },
  {
    "key": "kliverag.index.view",
    "service": "KliveRAG",
    "serviceKey": "kliverag",
    "area": "Index",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View index statistics",
    "description": "Index size and connected sources.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "kliverag.search.use",
    "service": "KliveRAG",
    "serviceKey": "kliverag",
    "area": "Search",
    "tier": "Read",
    "tierValue": 2,
    "title": "Search knowledge",
    "description": "Search and open documents from every connected source, and search the web.",
    "legacyRank": 5,
    "implies": [
      "kliverag.index.view"
    ],
    "sensitive": true
  },
  {
    "key": "kliverag.index.rebuild",
    "service": "KliveRAG",
    "serviceKey": "kliverag",
    "area": "Index",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Rebuild the index",
    "description": "Re-index every source.",
    "legacyRank": 5,
    "implies": [
      "kliverag.index.view"
    ],
    "sensitive": false
  },
  {
    "key": "klivetech.gadgets.read",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Gadgets",
    "tier": "Read",
    "tierValue": 2,
    "title": "View gadgets",
    "description": "Every gadget and its state.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivetech.gadgets.act",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Gadgets",
    "tier": "Act",
    "tierValue": 3,
    "title": "Operate gadgets",
    "description": "Run gadget actions.",
    "legacyRank": 5,
    "implies": [
      "klivetech.gadgets.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivetech.streamables.read",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Streamables",
    "tier": "Read",
    "tierValue": 2,
    "title": "View live telemetry",
    "description": "Streamable values, their history and the live feed.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivetech.streamables.control",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Streamables",
    "tier": "Act",
    "tierValue": 3,
    "title": "Control streamables",
    "description": "Start, stop and adjust streamables.",
    "legacyRank": 5,
    "implies": [
      "klivetech.streamables.read"
    ],
    "sensitive": false
  },
  {
    "key": "klivetech.firmware.read",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Firmware",
    "tier": "Read",
    "tierValue": 2,
    "title": "View firmware",
    "description": "Firmware configuration, projects and build jobs.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "klivetech.firmware.deploy",
    "service": "KliveTech",
    "serviceKey": "klivetech",
    "area": "Firmware",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Build and flash firmware",
    "description": "Compile firmware and push updates to devices.",
    "legacyRank": 5,
    "implies": [
      "klivetech.firmware.read"
    ],
    "sensitive": false
  },
  {
    "key": "memescraper.health.view",
    "service": "Meme Scraper",
    "serviceKey": "memescraper",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View scraper health",
    "description": "Scraper health and analytics.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "memescraper.sources.read",
    "service": "Meme Scraper",
    "serviceKey": "memescraper",
    "area": "Sources",
    "tier": "Read",
    "tierValue": 2,
    "title": "View sources",
    "description": "Instagram sources and saved niches.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "memescraper.scrape.run",
    "service": "Meme Scraper",
    "serviceKey": "memescraper",
    "area": "Scraping",
    "tier": "Act",
    "tierValue": 3,
    "title": "Run the scraper",
    "description": "Start a scrape now and diagnose the scraping providers.",
    "legacyRank": 2,
    "implies": [
      "memescraper.health.view"
    ],
    "sensitive": false
  },
  {
    "key": "memescraper.sources.manage",
    "service": "Meme Scraper",
    "serviceKey": "memescraper",
    "area": "Sources",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage sources",
    "description": "Add and delete Instagram sources (optionally with their memes).",
    "legacyRank": 2,
    "implies": [
      "memescraper.sources.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnidefence.overview.view",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View defence overview",
    "description": "Threat overview, the IP map, fingerprint status and IP classes.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnidefence.traffic.read",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Traffic",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read request logs",
    "description": "Every API request with its IP, profile, page and outcome, plus IP records and fingerprints.",
    "legacyRank": 5,
    "implies": [
      "omnidefence.overview.view"
    ],
    "sensitive": true
  },
  {
    "key": "omnidefence.auth.read",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Authentication",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read authentication logs",
    "description": "Login events, denials and profile actions.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omnidefence.ip.act",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "IP control",
    "tier": "Act",
    "tierValue": 3,
    "title": "Annotate and scan IPs",
    "description": "Add notes to IPs, scan them and change their class.",
    "legacyRank": 5,
    "implies": [
      "omnidefence.traffic.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnidefence.ip.block",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "IP control",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Block and release IPs",
    "description": "Block, unblock, untrap and set the status of IPs.",
    "legacyRank": 5,
    "implies": [
      "omnidefence.traffic.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnidefence.regions.manage",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Rules",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage blocked regions",
    "description": "View, add and remove geographic blocks.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnidefence.honeypots.manage",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Rules",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage honeypots",
    "description": "View, add and remove honeypot routes.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnidefence.data.export",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Data",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Export defence data",
    "description": "Download a full export of OmniDefence's records.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omnidefence.settings.manage",
    "service": "OmniDefence",
    "serviceKey": "omnidefence",
    "area": "Settings",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Change defence settings",
    "description": "Read and change OmniDefence settings.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnigram.overview.view",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View OmniGram overview",
    "description": "Dashboard statistics across all accounts.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnigram.accounts.read",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Accounts",
    "tier": "Read",
    "tierValue": 2,
    "title": "View accounts",
    "description": "Instagram accounts with their profiles and configuration.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnigram.accounts.act",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Accounts",
    "tier": "Act",
    "tierValue": 3,
    "title": "Operate accounts",
    "description": "Pause, resume and re-login accounts and edit their notes.",
    "legacyRank": 4,
    "implies": [
      "omnigram.accounts.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnigram.accounts.manage",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Accounts",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage accounts",
    "description": "Add and remove accounts, edit their Instagram profile and configuration.",
    "legacyRank": 4,
    "implies": [
      "omnigram.accounts.act"
    ],
    "sensitive": true
  },
  {
    "key": "omnigram.content.read",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Content",
    "tier": "Read",
    "tierValue": 2,
    "title": "View content",
    "description": "Content folders, posts, the publishing queue, analytics and events.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnigram.content.publish",
    "service": "OmniGram",
    "serviceKey": "omnigram",
    "area": "Content",
    "tier": "Act",
    "tierValue": 3,
    "title": "Publish content",
    "description": "Schedule, publish, cancel and draft posts, upload media and take analytics snapshots.",
    "legacyRank": 4,
    "implies": [
      "omnigram.content.read"
    ],
    "sensitive": false
  },
  {
    "key": "omniscience.overview.view",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View Omniscience status",
    "description": "Collection statistics, schedules and deduction status.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omniscience.sources.view",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Sources",
    "tier": "Read",
    "tierValue": 2,
    "title": "View data sources",
    "description": "The channels and accounts Omniscience collects from.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omniscience.persons.read",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "People",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read people profiles",
    "description": "Deduced profiles, facts, relationships, eras, watchlists, radar alerts and the review queue.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omniscience.messages.read",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Messages",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read raw messages",
    "description": "Conversations and full message history, including semantic search.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omniscience.persons.ask",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "People",
    "tier": "Act",
    "tierValue": 3,
    "title": "Ask about people",
    "description": "Ask questions answered from a person's message history.",
    "legacyRank": 5,
    "implies": [
      "omniscience.persons.read"
    ],
    "sensitive": true
  },
  {
    "key": "omniscience.review.act",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Review",
    "tier": "Act",
    "tierValue": 3,
    "title": "Review deductions",
    "description": "Resolve the review queue, dismiss targets, link identities, observe people, set tiers and eras, edit watchlists.",
    "legacyRank": 5,
    "implies": [
      "omniscience.persons.read"
    ],
    "sensitive": false
  },
  {
    "key": "omniscience.analysis.run",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Analysis",
    "tier": "Act",
    "tierValue": 3,
    "title": "Run analysis",
    "description": "Recompute profiles, run deduction and briefings, and trigger scheduled jobs now.",
    "legacyRank": 5,
    "implies": [
      "omniscience.overview.view"
    ],
    "sensitive": false
  },
  {
    "key": "omniscience.sources.manage",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Sources",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage sources",
    "description": "Add, remove and backfill sources, merge people and set profile targets.",
    "legacyRank": 5,
    "implies": [
      "omniscience.sources.view",
      "omniscience.persons.read"
    ],
    "sensitive": false
  },
  {
    "key": "omniscience.replica.read",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Replica",
    "tier": "Read",
    "tierValue": 2,
    "title": "View replicas",
    "description": "Replica status, training jobs, chats and fidelity reports.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omniscience.replica.chat",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Replica",
    "tier": "Act",
    "tierValue": 3,
    "title": "Chat with replicas",
    "description": "Create, rename and delete replica chats and send messages.",
    "legacyRank": 5,
    "implies": [
      "omniscience.replica.read"
    ],
    "sensitive": false
  },
  {
    "key": "omniscience.replica.train",
    "service": "Omniscience",
    "serviceKey": "omniscience",
    "area": "Replica",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Train replicas",
    "description": "Start replica training and fidelity runs.",
    "legacyRank": 5,
    "implies": [
      "omniscience.replica.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.status.view",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View trading status",
    "description": "Engine status, the firm overview, environments and system health.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.markets.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Markets",
    "tier": "Read",
    "tierValue": 2,
    "title": "View markets",
    "description": "Watchlists, instruments, quotes, candles and market search.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.markets.manage",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Markets",
    "tier": "Act",
    "tierValue": 3,
    "title": "Manage watchlists",
    "description": "Create, edit and delete watchlists and refresh the instrument list.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.markets.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.strategies.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Strategies",
    "tier": "Read",
    "tierValue": 2,
    "title": "View strategies",
    "description": "The strategy catalog and every strategy version.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.deployments.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Deployments",
    "tier": "Read",
    "tierValue": 2,
    "title": "View deployments",
    "description": "Running deployments with their equity curves, charts and ticks.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.deployments.control",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Deployments",
    "tier": "Act",
    "tierValue": 3,
    "title": "Pause and resume deployments",
    "description": "Pause a running deployment and resume it again.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.deployments.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.deployments.manage",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Deployments",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Create, kill and delete deployments",
    "description": "Start new deployments, kill running ones and delete them.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.deployments.control"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.deployments.go-live",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Deployments",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Arm live trading",
    "description": "Arm a deployment for real money and promote strategies to live.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.deployments.manage"
    ],
    "sensitive": true
  },
  {
    "key": "omnitrader.portfolio.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Portfolio",
    "tier": "Read",
    "tierValue": 2,
    "title": "View portfolio",
    "description": "Holdings, account balances, value history, the ledger and performance.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omnitrader.orders.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Orders",
    "tier": "Read",
    "tierValue": 2,
    "title": "View orders",
    "description": "Orders, order tickets and the accounts they can route to.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.orders.place",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Orders",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Place and manage orders",
    "description": "Propose, approve, reject and cancel orders.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.orders.read"
    ],
    "sensitive": true
  },
  {
    "key": "omnitrader.risk.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Risk",
    "tier": "Read",
    "tierValue": 2,
    "title": "View risk",
    "description": "Risk limits, reconciliation state and alerts.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.alerts.act",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Risk",
    "tier": "Act",
    "tierValue": 3,
    "title": "Handle alerts",
    "description": "Acknowledge and resolve alerts.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.risk.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.reconciliation.run",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Risk",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Run reconciliation",
    "description": "Reconcile the ledger and orders against venues and resolve breaks.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.risk.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.risk.manage",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Risk",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Change risk controls",
    "description": "Risk limits, safe mode, the kill switch and position reduction.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.risk.read"
    ],
    "sensitive": true
  },
  {
    "key": "omnitrader.backtests.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Research",
    "tier": "Read",
    "tierValue": 2,
    "title": "View backtests",
    "description": "Backtest runs and their results.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.backtests.run",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Research",
    "tier": "Act",
    "tierValue": 3,
    "title": "Run backtests",
    "description": "Start and cancel backtests.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.backtests.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.experiments.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Research",
    "tier": "Read",
    "tierValue": 2,
    "title": "View experiments",
    "description": "Experiments and promotion assessments.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.experiments.manage",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Research",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage experiments",
    "description": "Create, attach and update experiments and strategy versions.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.experiments.read",
      "omnitrader.strategies.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.journal.read",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Journal",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read the journal",
    "description": "The trading journal and its records.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.journal.write",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Journal",
    "tier": "Act",
    "tierValue": 3,
    "title": "Write to the journal",
    "description": "Annotate entries and record interventions.",
    "legacyRank": 5,
    "implies": [
      "omnitrader.journal.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitrader.signals.submit",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Signals",
    "tier": "Act",
    "tierValue": 3,
    "title": "Submit signals",
    "description": "Send a flow signal to running strategies.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitrader.venues.manage",
    "service": "OmniTrader",
    "serviceKey": "omnitrader",
    "area": "Venues",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Manage venues and authority",
    "description": "Connect trading venues and change an account's execution authority.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "omnitumblr.overview.view",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View OmniTumblr overview",
    "description": "The autopilot overview and dashboard statistics.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitumblr.blogs.read",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Blogs",
    "tier": "Read",
    "tierValue": 2,
    "title": "View blogs and posts",
    "description": "Blogs, posts, media, the content library, analytics and events.",
    "legacyRank": 1,
    "implies": [
      "omnitumblr.overview.view"
    ],
    "sensitive": false
  },
  {
    "key": "omnitumblr.posts.act",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Posts",
    "tier": "Act",
    "tierValue": 3,
    "title": "Work on posts",
    "description": "Create, edit, approve, skip, cancel and retry posts, regenerate captions and upload media.",
    "legacyRank": 4,
    "implies": [
      "omnitumblr.blogs.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitumblr.posts.publish",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Posts",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Publish to Tumblr",
    "description": "Publish posts immediately and delete published posts from Tumblr.",
    "legacyRank": 4,
    "implies": [
      "omnitumblr.posts.act"
    ],
    "sensitive": false
  },
  {
    "key": "omnitumblr.library.manage",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Library",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage the content library",
    "description": "Delete items from the content library.",
    "legacyRank": 4,
    "implies": [
      "omnitumblr.blogs.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitumblr.blogs.manage",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Blogs",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage blogs",
    "description": "Add, edit, remove and refresh blogs and plan their posts now.",
    "legacyRank": 4,
    "implies": [
      "omnitumblr.blogs.read"
    ],
    "sensitive": false
  },
  {
    "key": "omnitumblr.settings.view",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Settings",
    "tier": "Manage",
    "tierValue": 4,
    "title": "View settings and connections",
    "description": "App settings and the state of Tumblr connections.",
    "legacyRank": 4,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "omnitumblr.settings.manage",
    "service": "OmniTumblr",
    "serviceKey": "omnitumblr",
    "area": "Settings",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Change settings and connections",
    "description": "App keys, connecting and disconnecting Tumblr accounts.",
    "legacyRank": 4,
    "implies": [
      "omnitumblr.settings.view"
    ],
    "sensitive": true
  },
  {
    "key": "projects.overview.view",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Overview",
    "tier": "Glance",
    "tierValue": 1,
    "title": "View projects overview",
    "description": "The project list, fleet health, cache health and broadcast status.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "projects.details.read",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Projects",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read project details",
    "description": "State, events, digests, ledgers, analytics, agents, plans, councils, memory, gates, hooks and artifacts.",
    "legacyRank": 5,
    "implies": [
      "projects.overview.view"
    ],
    "sensitive": true
  },
  {
    "key": "projects.events.stream",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Projects",
    "tier": "Read",
    "tierValue": 2,
    "title": "Stream project events",
    "description": "The live event stream of a project.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.screens.view",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Computers",
    "tier": "Read",
    "tierValue": 2,
    "title": "Watch agent computers",
    "description": "Live video of the agents' container desktops.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.files.read",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Files",
    "tier": "Read",
    "tierValue": 2,
    "title": "Read project files",
    "description": "List, inspect and download project files and their audit trail.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.agents.message",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Agents",
    "tier": "Act",
    "tierValue": 3,
    "title": "Message agents",
    "description": "Message a project's commander or agents and broadcast to every project.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.gates.resolve",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Agents",
    "tier": "Act",
    "tierValue": 3,
    "title": "Resolve approval gates",
    "description": "Approve or reject what agents ask permission for.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.plan.edit",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Planning",
    "tier": "Act",
    "tierValue": 3,
    "title": "Edit plans and memory",
    "description": "Add, reorder, activate and close steps, edit project memory and observables, pin results.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.files.write",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Files",
    "tier": "Act",
    "tierValue": 3,
    "title": "Write project files",
    "description": "Upload, move, copy and organise project files.",
    "legacyRank": 5,
    "implies": [
      "projects.files.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.files.delete",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Files",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Delete project files",
    "description": "Delete project files.",
    "legacyRank": 5,
    "implies": [
      "projects.files.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.lifecycle.manage",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Projects",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Run projects",
    "description": "Create, pause, resume, archive and rename projects, change budgets and settings, retire agents.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": false
  },
  {
    "key": "projects.fleet.control",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Fleet",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Control the whole fleet",
    "description": "Halt and resume every project, change system-wide settings and reset cache health.",
    "legacyRank": 5,
    "implies": [
      "projects.overview.view"
    ],
    "sensitive": false
  },
  {
    "key": "projects.hooks.manage",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Hooks",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Manage hooks",
    "description": "Create and delete project hooks and rotate their tokens.",
    "legacyRank": 5,
    "implies": [
      "projects.details.read"
    ],
    "sensitive": true
  },
  {
    "key": "projects.screens.control",
    "service": "Projects",
    "serviceKey": "projects",
    "area": "Computers",
    "tier": "Critical",
    "tierValue": 5,
    "title": "Control agent computers",
    "description": "Send mouse and keyboard input to agent desktops.",
    "legacyRank": 5,
    "implies": [
      "projects.screens.view"
    ],
    "sensitive": true
  },
  {
    "key": "stratum.projects.read",
    "service": "Stratum",
    "serviceKey": "stratum",
    "area": "Projects",
    "tier": "Read",
    "tierValue": 2,
    "title": "View your designs",
    "description": "Your Stratum projects, runs, artifacts, attachments and chats.",
    "legacyRank": 1,
    "implies": [],
    "sensitive": false
  },
  {
    "key": "stratum.design.run",
    "service": "Stratum",
    "serviceKey": "stratum",
    "area": "Design",
    "tier": "Act",
    "tierValue": 3,
    "title": "Design with Stratum",
    "description": "Start and cancel runs, resolve gates, chat with the engineer and upload files.",
    "legacyRank": 1,
    "implies": [
      "stratum.projects.read"
    ],
    "sensitive": false
  },
  {
    "key": "stratum.projects.manage",
    "service": "Stratum",
    "serviceKey": "stratum",
    "area": "Projects",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage your designs",
    "description": "Create, rename and delete your Stratum projects.",
    "legacyRank": 1,
    "implies": [
      "stratum.projects.read"
    ],
    "sensitive": false
  },
  {
    "key": "tripwires.wires.read",
    "service": "Tripwires",
    "serviceKey": "tripwires",
    "area": "Tripwires",
    "tier": "Read",
    "tierValue": 2,
    "title": "View tripwires",
    "description": "Tripwires, the hits they recorded and their summaries.",
    "legacyRank": 5,
    "implies": [],
    "sensitive": true
  },
  {
    "key": "tripwires.alerts.test",
    "service": "Tripwires",
    "serviceKey": "tripwires",
    "area": "Alerts",
    "tier": "Act",
    "tierValue": 3,
    "title": "Send test alerts",
    "description": "Send a test notification for a tripwire.",
    "legacyRank": 5,
    "implies": [
      "tripwires.wires.read"
    ],
    "sensitive": false
  },
  {
    "key": "tripwires.wires.manage",
    "service": "Tripwires",
    "serviceKey": "tripwires",
    "area": "Tripwires",
    "tier": "Manage",
    "tierValue": 4,
    "title": "Manage tripwires",
    "description": "Create, edit and delete tripwires and clear their history.",
    "legacyRank": 5,
    "implies": [
      "tripwires.wires.read"
    ],
    "sensitive": false
  }
];

export const RANK_NAMES = ['None', 'Guest', 'Manager', 'Associate', 'Admin', 'Klives'] as const;

/** What a profile of this retired rank holds after migration (Klives = everything). */
export function permissionsForRank(rank: number): string[] {
  return PERMISSIONS.filter(p => p.legacyRank <= rank).map(p => p.key);
}

export interface FixtureMeOptions {
  userId?: string;
  name?: string;
  rank?: number;
  isOwner?: boolean;
  permissions?: string[];
  suspended?: boolean;
  suspendedUntilUtc?: string | null;
  suspensionReason?: string | null;
  readOnly?: boolean;
  accessVersion?: number;
}

/** A `/KMProfiles/me` payload. Usable permissions drop out while suspended / read-only, like the gate. */
export function mePayload(options: FixtureMeOptions = {}) {
  const rank = options.rank ?? (options.isOwner ? 5 : 1);
  const isOwner = options.isOwner ?? rank === 5;
  const granted = isOwner ? PERMISSIONS.map(p => p.key) : (options.permissions ?? permissionsForRank(rank));
  const usable = isOwner ? granted
    : options.suspended ? []
      : options.readOnly ? granted.filter(k => (PERMISSIONS.find(p => p.key === k)?.tierValue ?? 9) < 3)
        : granted;
  return {
    userId: options.userId ?? `e2e-${RANK_NAMES[rank].toLowerCase()}`,
    name: options.name ?? `${RANK_NAMES[rank]} Fixture`,
    rank: RANK_NAMES[rank],
    rankValue: rank,
    isOwner,
    canLogin: true,
    discordId: null,
    createdUtc: '2026-01-01T00:00:00Z',
    permissions: usable,
    grantedPermissions: granted,
    accessVersion: options.accessVersion ?? 1,
    suspended: !!options.suspended,
    suspendedUntilUtc: options.suspended ? (options.suspendedUntilUtc ?? '2026-12-31T00:00:00Z') : null,
    suspensionReason: options.suspended ? (options.suspensionReason ?? null) : null,
    readOnly: !!options.readOnly,
    sessionId: 'session-e2e',
    authMethod: 'session',
    assignableRanks: isOwner ? ['Guest', 'Manager', 'Associate', 'Admin'] : RANK_NAMES.slice(1, rank),
  };
}

/** The `/KMProfiles/permissions/catalog` payload, optionally with the routes each key unlocks. */
export function catalogPayload(withRoutes = false) {
  const services = new Map<string, { key: string; name: string; permissions: unknown[] }>();
  for (const p of PERMISSIONS) {
    const entry = services.get(p.serviceKey) ?? { key: p.serviceKey, name: p.service, permissions: [] };
    entry.permissions.push({
      key: p.key, area: p.area, tier: p.tier, tierValue: p.tierValue, title: p.title, description: p.description,
      sensitive: p.sensitive, implies: p.implies, ownerGrantOnly: p.serviceKey === 'profiles' && p.tierValue === 5,
      legacyRank: RANK_NAMES[p.legacyRank],
      routes: withRoutes ? [{ path: `/${p.serviceKey}/${p.key.split('.').slice(1).join('/')}`, method: p.tierValue >= 3 ? 'POST' : 'GET', kind: 'route' }] : null,
    });
    services.set(p.serviceKey, entry);
  }
  return {
    version: 1,
    tiers: [
      { value: 1, name: 'Glance', description: 'Status, counts and summaries.' },
      { value: 2, name: 'Read', description: 'Full records, history and content.' },
      { value: 3, name: 'Act', description: 'Routine, mostly reversible operations.' },
      { value: 4, name: 'Manage', description: 'Creating, deleting and configuring.' },
      { value: 5, name: 'Critical', description: 'Live money, host control, secrets and other profiles.' },
    ],
    services: [...services.values()].sort((a, b) => a.name.localeCompare(b.name)),
    publicRoutes: withRoutes ? [{ path: '/KMProfiles/Login', method: 'POST', kind: 'route' }] : null,
    signedInRoutes: withRoutes ? [{ path: '/KMProfiles/me', method: 'GET', kind: 'route' }] : null,
  };
}
