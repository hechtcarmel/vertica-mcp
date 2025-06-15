# Vertica MCP Server

A Model Context Protocol (MCP) server for readonly communication with Vertica databases. This server enables AI assistants like Claude to interact with Vertica databases safely through a comprehensive set of readonly operations.

## Features

- 🔒 **Readonly Operations Only** - Ensures database safety with SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries only
- 🏗️ **Comprehensive Schema Discovery** - List tables, views, and indexes with detailed metadata
- 🔍 **Table Structure Analysis** - Get detailed column information, data types, and constraints
- 📊 **Query Execution** - Execute custom SQL queries with parameter support
- 🌊 **Streaming Support** - Handle large result sets efficiently with batch streaming
- ⚡ **High Performance** - Connection pooling and query optimization for Vertica
- 🛡️ **Type Safety** - Full TypeScript implementation with comprehensive error handling
- 📋 **MCP Standard Compliance** - Built with mcp-framework following MCP best practices

## Prerequisites

- Node.js 18.x or higher
- pnpm package manager
- Access to a Vertica database
- Environment variables for database connection

## Installation

### From Source

1. Clone the repository:
```bash
git clone <repository-url>
cd vertica-mcp
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm run build
```



### Environment Configuration

Create a `.env` file in the project root with your Vertica connection details:

```env
# Required: Vertica Database Connection
VERTICA_HOST=localhost
VERTICA_PORT=5433
VERTICA_DATABASE=VMart
VERTICA_USER=dbadmin
VERTICA_PASSWORD=your_password

# Optional: Connection Pool Settings
VERTICA_CONNECTION_LIMIT=10
VERTICA_QUERY_TIMEOUT=30000

# Optional: SSL Settings
VERTICA_SSL=false
VERTICA_SSL_REJECT_UNAUTHORIZED=true

# Optional: Default Schema
VERTICA_DEFAULT_SCHEMA=public
```

## Usage

### Running the Server

```bash
# Start the MCP server
pnpm start

# Or for development with auto-rebuild
pnpm run dev
```

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/vertica-mcp/dist/index.js"],
      "env": {
        "VERTICA_HOST": "localhost",
        "VERTICA_PORT": "5433",
        "VERTICA_DATABASE": "VMart",
        "VERTICA_USER": "dbadmin",
        "VERTICA_PASSWORD": "your_password"
      }
    }
  }
}
```

### Using with Cursor

1. Open Cursor settings
2. Navigate to Features → MCP Servers
3. Add a new server with:
   - Name: `vertica-mcp`
   - Command: `node`
   - Arguments: `["/path/to/vertica-mcp/dist/index.js"]`
   - Environment variables as needed

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
- `maxRows` (number, optional): Maximum total rows to fetch

**Example:**
```sql
SELECT * FROM public.store_sales_fact ORDER BY sale_date_key
```

### 3. get_table_structure

Get detailed structure information for a specific table.

**Parameters:**
- `tableName` (string, required): Name of the table to analyze
- `schemaName` (string, optional): Schema name (defaults to configured schema)

**Example:**
```json
{
  "tableName": "customer_dimension",
  "schemaName": "public"
}
```

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

- Uses connection pooling for efficient resource management
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
- Connection pooling with configurable limits
- Automatic connection cleanup and timeout handling
- Password masking in logs for security

## Development

### Project Structure

```
vertica-mcp/
├── src/
│   ├── config/          # Configuration management
│   ├── services/        # Database service layer
│   ├── tools/           # MCP tool implementations
│   ├── types/           # TypeScript type definitions
│   └── index.ts         # Main server entry point
├── dist/                # Compiled output
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

### Building

```bash
# Clean and build
pnpm run clean
pnpm run build

# Type checking only
pnpm run typecheck

# Development with watch mode
pnpm run dev
```

### Testing

Test the server locally:

```bash
# Build and start
pnpm run build
pnpm start

# Test with environment variables
VERTICA_HOST=testhost pnpm start
```

## Troubleshooting

### Common Issues

#### "Client is not a constructor" Error

**Problem:** Getting error `"Failed to connect to Vertica: Client is not a constructor"`

**Solution:** This was a known issue with the Vertica Node.js client import. It has been fixed in this version. If you still encounter this error:

1. Ensure you're using the latest version of this MCP server
2. Verify your Node.js version is 18.x or higher
3. Try rebuilding the project:
   ```bash
   pnpm run clean
   pnpm run build
   ```

#### Connection Issues

1. **Verify database connectivity:**
   ```bash
   # Test connection manually
   vsql -h localhost -p 5433 -d VMart -U dbadmin
   ```

2. **Verify MCP server builds correctly:**
   ```bash
   pnpm run build
   pnpm start
   ```

3. **Check environment variables:**
   - Ensure all required variables are set
   - Verify credentials are correct
   - Check network connectivity to Vertica host

4. **SSL Configuration:**
   - If using SSL, ensure certificates are properly configured
   - Try disabling SSL for testing: `VERTICA_SSL=false`

### Query Execution Issues

1. **Permission Errors:**
   - Ensure the database user has SELECT permissions on target schemas
   - Check that the user can access system catalogs (`v_catalog.*`)

2. **Query Timeouts:**
   - Increase `VERTICA_QUERY_TIMEOUT` for complex queries
   - Use `stream_query` for large result sets

3. **Schema Access:**
   - Verify schema names are correct (case-sensitive)
   - Check that tables exist in the specified schema

### Performance Optimization

1. **Connection Pooling:**
   - Adjust `VERTICA_CONNECTION_LIMIT` based on workload
   - Monitor connection usage in Vertica system tables

2. **Query Performance:**
   - Use appropriate WHERE clauses to limit result sets
   - Leverage Vertica's columnar storage with projection-aware queries
   - Use `EXPLAIN` to analyze query plans

3. **Batch Size Tuning:**
   - Adjust `batchSize` in `stream_query` based on memory constraints
   - Monitor network latency and adjust accordingly

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes following the existing code style
4. Test thoroughly with a real Vertica database
5. Submit a pull request with a clear description

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Vertica documentation for database-specific issues
3. Open an issue on the project repository with detailed information

---

**Note:** This server provides readonly access only. It cannot modify data, structure, or permissions in your Vertica database, ensuring safety for production environments. 