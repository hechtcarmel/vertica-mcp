# Vertica MCP Server

A Model Context Protocol (MCP) server for readonly communication with Vertica databases. This server enables AI assistants like Claude and Cursor to interact with Vertica databases safely through a comprehensive set of readonly operations.

## Features

- 🔒 **Readonly Operations Only** - Ensures database safety with SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries only
- 🏗️ **Comprehensive Schema Discovery** - List tables, views, and indexes with detailed metadata
- 🔍 **Table Structure Analysis** - Get detailed column information, data types, and constraints
- 📊 **Query Execution** - Execute custom SQL queries with parameter support
- 🌊 **Streaming Support** - Handle large result sets efficiently with batch streaming
- ⚡ **High Performance** - Optimized connection handling and query execution for Vertica
- 🛡️ **Type Safety** - Full TypeScript implementation with comprehensive error handling
- 📋 **MCP Standard Compliance** - Built with official `@modelcontextprotocol/sdk` following MCP best practices

## Prerequisites

- Node.js 18.x or higher
- Access to a Vertica database
- Environment variables for database connection

## Installation & Usage

### Quick Start with Cursor (Recommended)

The easiest way to use this MCP server with Cursor is to configure it in your MCP settings:

1. **Create an environment file** (e.g., `~/.cursor/vertica.env`):
```env
# Required: Vertica Database Connection
VERTICA_HOST=your-vertica-host.com
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=your_username
VERTICA_PASSWORD=your_password

# Optional: Default Schema
VERTICA_DEFAULT_SCHEMA=public

# Optional: Connection Settings
VERTICA_CONNECTION_LIMIT=10
VERTICA_QUERY_TIMEOUT=60000

# Optional: SSL Settings
VERTICA_SSL=false
VERTICA_SSL_REJECT_UNAUTHORIZED=true
```

2. **Configure Cursor MCP** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp@1.2.2",
        "--env-file",
        "/Users/yourusername/.cursor/vertica.env"
      ]
    }
  }
}
```

3. **Restart Cursor** and start querying your Vertica database!

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp@1.2.2",
        "--env-file",
        "/path/to/your/vertica.env"
      ]
    }
  }
}
```

### Direct Usage

```bash
# Run with custom environment file
npx @hechtcarmel/vertica-mcp@1.2.2 --env-file /path/to/your/.env

# Run with environment variables in current directory (.env file)
npx @hechtcarmel/vertica-mcp@1.2.2

# Show help
npx @hechtcarmel/vertica-mcp@1.2.2 --help

# Show version
npx @hechtcarmel/vertica-mcp@1.2.2 --version
```

## Environment Configuration

Create a `.env` file with your Vertica connection details:

```env
# Required: Vertica Database Connection
VERTICA_HOST=localhost
VERTICA_PORT=5433
VERTICA_DATABASE=VMart
VERTICA_USER=dbadmin
VERTICA_PASSWORD=your_password

# Optional: Connection Pool Settings
VERTICA_CONNECTION_LIMIT=10
VERTICA_QUERY_TIMEOUT=60000

# Optional: SSL Settings
VERTICA_SSL=false
VERTICA_SSL_REJECT_UNAUTHORIZED=true

# Optional: Default Schema
VERTICA_DEFAULT_SCHEMA=public
```

## Available Tools

### 1. execute_query

Execute readonly SQL queries against the Vertica database.

**Parameters:**
- `sql` (string, required): SQL query to execute
- `params` (array, optional): Parameters for parameterized queries

**Example:**
```sql
SELECT customer_key, customer_name, customer_state 
FROM public.customer_dimension 
WHERE customer_state = ? 
LIMIT 10
```

### 2. stream_query

Stream large query results in manageable batches.

**Parameters:**
- `sql` (string, required): SQL query to execute
- `batchSize` (number, optional): Rows per batch (default: 1000, max: 10000)
- `maxRows` (number, optional): Maximum total rows to fetch (max: 1000000)

**Example:**
```sql
SELECT * FROM public.store_sales_fact ORDER BY sale_date_key
```

### 3. get_table_structure

Get detailed structure information for a specific table.

**Parameters:**
- `tableName` (string, required): Name of the table to analyze
- `schemaName` (string, optional): Schema name (defaults to configured schema)

### 4. list_tables

List all tables in a schema with metadata.

**Parameters:**
- `schemaName` (string, optional): Schema name (defaults to configured schema)

### 5. list_views

List all views in a schema with their definitions.

**Parameters:**
- `schemaName` (string, optional): Schema name (defaults to configured schema)

### 6. list_indexes

List indexes (projections) for a specific table.

**Parameters:**
- `tableName` (string, required): Name of the table
- `schemaName` (string, optional): Schema name (defaults to configured schema)

**Note:** In Vertica, indexes are implemented as projections, which provide similar functionality for query optimization.

## Vertica-Specific Features

### Projections as Indexes

Vertica uses projections instead of traditional indexes. The `list_indexes` tool provides information about projections that serve similar purposes to indexes in other databases.

### System Catalogs

The server leverages Vertica's system catalogs (`v_catalog.*`) for metadata discovery:
- `v_catalog.tables` - Table information
- `v_catalog.columns` - Column details
- `v_catalog.views` - View definitions
- `v_catalog.projections` - Projection information

### Query Optimization

- Efficient connection handling with proper cleanup
- Implements query timeouts to prevent long-running operations
- Supports batch processing for large result sets
- Leverages Vertica's columnar storage advantages

## Security & Safety

### Readonly Enforcement

The server enforces readonly operations by validating that all queries start with approved keywords:
- `SELECT` - Data retrieval
- `SHOW` - Metadata display
- `DESCRIBE` - Structure information
- `EXPLAIN` - Query plan analysis
- `WITH` - Common table expressions

### Input Validation

- All inputs are validated using Zod schemas
- SQL injection protection through parameterized queries
- Connection limits and timeouts prevent resource exhaustion
- Comprehensive error handling with detailed logging

### Connection Security

- Supports SSL/TLS connections to Vertica
- Automatic connection cleanup and timeout handling
- Password masking in logs for security

## Development

### Project Structure

```
vertica-mcp/
├── src/
│   ├── config/          # Configuration management
│   ├── constants/       # Application constants
│   ├── services/        # Database service layer
│   ├── tools/           # MCP tool implementations
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions and helpers
│   └── index.ts         # Main server entry point
├── dist/                # Compiled output
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

### Code Architecture

This project follows modern TypeScript best practices and clean architecture principles:

#### **Official MCP SDK Integration**
- All tools implement the `MCPTool` interface using the official `@modelcontextprotocol/sdk`
- Uses standard JSON Schema format for tool input validation
- Implements proper MCP protocol message handling and tool registration
- Full compatibility with npx execution and all MCP clients

#### **Utility Modules**
- `response-formatter.ts`: Standardized API response formatting
- `table-helpers.ts`: Reusable table and schema operations
- Constants are centralized to eliminate magic numbers/strings

#### **Error Handling**
- Structured error types with detailed context
- Consistent error responses across all tools
- Proper TypeScript error typing
- Graceful service cleanup in finally blocks

### Building from Source

```bash
# Clone the repository
git clone https://github.com/hechtcarmel/vertica-mcp.git
cd vertica-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start

# Development with watch mode
npm run dev

# Type checking only
npm run typecheck

# Test connection with local settings
npm run test:connection
```

## Troubleshooting

### Common Issues

#### Connection Issues

1. **Verify database connectivity:**
   ```bash
   # Test connection manually
   vsql -h localhost -p 5433 -d VMart -U dbadmin
   ```

2. **Check environment variables:**
   - Ensure all required variables are set
   - Verify credentials are correct
   - Check network connectivity to Vertica host

3. **SSL Configuration:**
   - If using SSL, ensure certificates are properly configured
   - Try disabling SSL for testing: `VERTICA_SSL=false`

#### Permission Issues

- Ensure the database user has SELECT permissions on target schemas
- Check that the user can access system catalogs (`v_catalog.*`)

#### Query Performance

1. **Query Timeouts:**
   - Increase `VERTICA_QUERY_TIMEOUT` for complex queries
   - Use `stream_query` for large result sets

2. **Batch Size Tuning:**
   - Adjust `batchSize` in `stream_query` based on memory constraints
   - Monitor network latency and adjust accordingly

### Version Updates

```bash
# Update to latest version
npx @hechtcarmel/vertica-mcp@latest

# Check your current version
npx @hechtcarmel/vertica-mcp --version

# Clear npm cache if needed
npm cache clean --force
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes following the existing code style and architecture
4. Run code quality checks: `npm run check`
5. Test thoroughly with a real Vertica database
6. Submit a pull request with a clear description

### Development Guidelines

When contributing to this project, please follow these guidelines:

- **Follow MCP patterns**: All new tools should implement `MCPTool` interface
- **Use proper schemas**: Define schemas with `type` and `description` properties
- **Add constants**: Put magic numbers/strings in `src/constants/index.ts`
- **Create utilities**: Extract reusable logic into `src/utils/` modules
- **Type everything**: Use TypeScript types extensively
- **Validate inputs**: Use Zod schemas for input validation
- **Handle errors properly**: Use structured error types and proper cleanup
- **Test with npx**: Always test tools work correctly when run via `npx`

## Changelog

### v1.2.2 (Current)
- **🔧 Enhanced**: Improved connection handling and error management
- **📦 Updated**: Latest dependencies and security patches
- **🏗️ Stable**: Production-ready release with comprehensive testing

### v1.1.0
- **🚀 Major**: Migrated to official MCP SDK (`@modelcontextprotocol/sdk`)
- **🔧 Enhanced**: All tools now use proper JSON Schema validation with Zod
- **📦 Improved**: Better error handling and type safety throughout
- **⚡ Performance**: Improved protocol compliance and message handling

### v1.0.9
- **🔧 Fixed**: MCP framework compatibility issues
- **🔧 Fixed**: NPX execution now works correctly with all MCP clients
- **♻️ Refactored**: Improved tool architecture and error handling

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Vertica documentation for database-specific issues
3. Open an issue on the [GitHub repository](https://github.com/hechtcarmel/vertica-mcp/issues)

## Quick Examples

### Cursor Configuration Example
```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp@1.2.2",
        "--env-file",
        "/Users/yourusername/.cursor/vertica.env"
      ]
    }
  }
}
```

### Environment File Example
```env
VERTICA_HOST=your-vertica-host.com
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=your_username
VERTICA_PASSWORD=your_password
VERTICA_DEFAULT_SCHEMA=public
```

---

**Note:** This server provides readonly access only. It cannot modify data, structure, or permissions in your Vertica database, ensuring safety for production environments. 