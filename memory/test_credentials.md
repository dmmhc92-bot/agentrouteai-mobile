# Test Credentials for AgentRoute CRM

## Standard Test Users (from seed_data.py)

### Admin User
- **Email:** admin@agentroute.com
- **Password:** Admin123!
- **Role:** admin
- **Access:** Full system access, can view all leads and manage all users

### Manager User  
- **Email:** manager@agentroute.com
- **Password:** Manager123!
- **Role:** manager
- **Access:** Can view leads from their downline agents, access command center

### Agent User
- **Email:** agent@agentroute.com  
- **Password:** Agent123!
- **Role:** agent
- **Access:** Can only view their own leads, no command center access

## Review Request Test Users

### Admin User (AppStore)
- **Email:** appstore_admin@agentroute.com
- **Password:** AppStoreAdmin1!
- **Role:** admin

### Manager User (AppStore)
- **Email:** appstore_manager@agentroute.com
- **Password:** AppStoreManager1!
- **Role:** manager

### Agent User (AppStore)
- **Email:** appstore_agent@agentroute.com
- **Password:** AppStoreAgent1!
- **Role:** agent

## Notes
- All users should have active status
- Hierarchy: Admin -> Manager -> Agent
- Manager should only see leads from their downline
- Agent should only see their own leads