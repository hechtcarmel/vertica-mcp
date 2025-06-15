# Vertica MCP Server Implementation Plan

## Project Overview
Create a Node.js TypeScript MCP (Model Context Protocol) server for readonly communication with Vertica databases using the mcp-framework and vertica-nodejs libraries.

## Project Structure
```
vertica-mcp/
├── package.json
├── tsconfig.json
├── pnpm-lock.yaml
├── .env.example
├── .gitignore
├── README.md
├── Plan.md
├── src/
│   ├── index.ts (main server entry)
│   ├── config/
│   │   └── database.ts (connection config)
│   ├── tools/
│   │   ├── execute-query.ts
│   │   ├── stream-query.ts
│   │   ├── get-table-structure.ts
│   │   ├── list-indexes.ts
│   │   ├── list-views.ts
│   │   └── list-tables.ts
│   ├── services/
│   │   └── vertica-service.ts
│   └── types/
│       └── vertica.ts
└── dist/ (compiled output)
```

## Key Dependencies
- **mcp-framework**: MCP server implementation
- **vertica-nodejs**: Vertica database connectivity  
- **zod**: Input validation and schema definition
- **dotenv**: Environment configuration
- **typescript, @types/node**: Development dependencies

## Implementation Strategy

### 1. Database Service Layer (VerticaService)
- Connection management with pooling
- Query execution with proper error handling
- Schema introspection methods
- Readonly enforcement (filter out non-SELECT queries)

### 2. MCP Tools Implementation
Each tool will:
- Use Zod schemas for input validation
- Call appropriate VerticaService methods
- Handle errors gracefully
- Return structured responses

### 3. Configuration Support
Environment variables and direct parameters:
- VERTICA_HOST, VERTICA_PORT, VERTICA_DATABASE
- VERTICA_USER, VERTICA_PASSWORD  
- VERTICA_CONNECTION_LIMIT, VERTICA_SSL
- Connection timeout settings

### 4. Security Considerations
- Validate all SQL queries to ensure they're readonly (SELECT, SHOW, DESCRIBE only)
- Sanitize inputs to prevent SQL injection
- Mask passwords in logs
- Connection limits and timeouts

## MCP Tools to Implement

### 1. execute_query
- **Purpose**: Execute readonly SQL queries
- **Input**: sql (string), params (optional array)
- **Validation**: Ensure query starts with SELECT, SHOW, DESCRIBE, EXPLAIN
- **Output**: Query results as structured data

### 2. stream_query
- **Purpose**: Stream large query results in batches
- **Input**: sql (string), batchSize (number, default 1000)
- **Output**: Streamed results in batches

### 3. get_table_structure
- **Purpose**: Get detailed table information
- **Input**: tableName (string), schemaName (optional string)
- **Output**: Columns, types, constraints, comments

### 4. list_tables
- **Purpose**: List all tables in a schema
- **Input**: schemaName (optional string, default 'public')
- **Output**: Table names and metadata

### 5. list_views
- **Purpose**: List all views in a schema
- **Input**: schemaName (optional string)
- **Output**: View names and definitions

### 6. list_indexes
- **Purpose**: List indexes for a table
- **Input**: tableName (string), schemaName (optional string)
- **Output**: Index information

## Vertica-specific Best Practices

### 1. Connection Management
- Use connection pooling (vertica-nodejs supports this)
- Set appropriate connection timeouts
- Handle connection errors gracefully
- Implement connection health checks

### 2. Query Optimization
- Use prepared statements where possible
- Implement query timeouts
- For large results, use streaming with proper batch sizes
- Add query result size limits

### 3. Schema Queries for Vertica
- Use system tables: v_catalog.tables, v_catalog.columns, v_catalog.indexes
- Leverage v_monitor views for performance insights
- Use SHOW statements for metadata

### 4. Error Handling
- Handle Vertica-specific error codes
- Provide meaningful error messages
- Log errors appropriately without exposing sensitive data

### 5. Performance Considerations
- Implement query caching for schema information
- Use appropriate fetch sizes for large result sets
- Monitor connection pool usage

## Development Steps

### Phase 1: Project Setup
1. Initialize pnpm project with package.json
2. Set up TypeScript configuration
3. Install dependencies (mcp-framework, vertica-nodejs, zod, dotenv)
4. Create basic project structure

### Phase 2: Configuration Setup
1. Create .env.example with all required variables
2. Implement database configuration with validation
3. Set up connection parameters with defaults

### Phase 3: Database Service Implementation
1. Create VerticaService class with connection pooling
2. Implement query validation for readonly operations
3. Add schema introspection methods
4. Implement error handling and logging

### Phase 4: MCP Tools Implementation
1. Create each tool file with proper Zod schemas
2. Implement tool logic using VerticaService
3. Add comprehensive error handling
4. Test each tool independently

### Phase 5: Main Server Setup
1. Configure MCP server with tools
2. Set up proper transport (STDIO)
3. Add startup configuration and validation
4. Implement graceful shutdown

### Phase 6: Documentation and Testing
1. Comprehensive README.md with setup instructions
2. Environment variable documentation
3. Usage examples for each MCP tool
4. Connection troubleshooting guide

## Success Criteria
- ✅ Node.js 18.x TypeScript project with pnpm
- ✅ MCP server using mcp-framework 
- ✅ Vertica connectivity with vertica-nodejs
- ✅ Readonly operations only (SELECT, SHOW, DESCRIBE)
- ✅ Following best practices for both technologies
- ✅ All 6 MCP tools implemented and working
- ✅ Comprehensive error handling and validation
- ✅ Complete documentation and examples

## Next Steps
1. Follow this plan step by step
2. Implement each phase completely before moving to the next
3. Test thoroughly at each stage
4. Document any deviations or improvements to the plan 