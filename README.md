# Vertica MCP Server

A Model Context Protocol (MCP) server for Vertica databases. Enables AI assistants to query and explore Vertica databases through natural language.

**Safety-first design**: Readonly mode by default. Write operations require explicit configuration.

## Features

- **6 MCP Tools**: Query execution, streaming, schema discovery
- **Readonly Protection**: Only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH queries by default
- **Large Dataset Streaming**: Efficient batch processing (up to 1M rows)
- **Vertica-Optimized**: Projection awareness, columnar query support
- **Production Ready**: Connection pooling, SSL support, timeout configuration
- **Parameter Binding**: SQL injection protection

## Quick Start

### Claude Code

```bash
claude mcp add vertica --env-file /path/to/your/.env -- npx -y @hechtcarmel/vertica-mcp
```

Create your `.env` file with connection details:

```env
VERTICA_HOST=your-vertica-host.com
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=your_username
VERTICA_PASSWORD=your_password
```

### Cursor

1. Create environment file `~/.cursor/vertica.env`:
```env
VERTICA_HOST=your-vertica-host.com
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=your_username
VERTICA_PASSWORD=your_password
```

2. Configure `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp",
        "--env-file",
        "/Users/yourusername/.cursor/vertica.env"
      ]
    }
  }
}
```

3. Restart Cursor

### Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp",
        "--env-file",
        "/path/to/your/.env"
      ]
    }
  }
}
```

## Configuration

### Required Variables
```env
VERTICA_HOST          # Database hostname
VERTICA_DATABASE      # Database name
VERTICA_USER          # Username
```

### Optional Variables
```env
VERTICA_PORT=5433                      # Default: 5433
VERTICA_PASSWORD                       # Password (optional)
VERTICA_READONLY_MODE=true             # Default: true
VERTICA_CONNECTION_LIMIT=10            # Default: 10 (max: 100)
VERTICA_QUERY_TIMEOUT=60000            # Default: 60000ms
VERTICA_SSL=false                      # Default: false
VERTICA_SSL_REJECT_UNAUTHORIZED=true   # Default: true
VERTICA_DEFAULT_SCHEMA=public          # Default: public
```

### Enabling Write Operations

To allow INSERT/UPDATE/DELETE/CREATE/DROP operations:

```env
VERTICA_READONLY_MODE=false
```

**Warning**: Only disable readonly mode if you understand the implications.

## Available Tools

### Query Execution
- **execute_query**: Execute SQL with optional parameters
- **stream_query**: Handle large datasets with configurable batching

### Schema Discovery
- **get_table_structure**: Table columns, types, constraints
- **list_tables**: All tables in schema with metadata
- **list_views**: All views with definitions
- **list_indexes**: Vertica projections for optimization

## Usage Examples

### Query Data
```sql
SELECT customer_state, COUNT(*) as count
FROM customer_dimension
GROUP BY customer_state
ORDER BY count DESC
LIMIT 10;
```

### Explore Schema
```sql
SHOW TABLES;
DESCRIBE customer_dimension;
```

### Analyze Performance
```sql
EXPLAIN SELECT * FROM store_sales_fact
WHERE sale_date_key > '2023-01-01';
```

### Stream Large Results

When querying large datasets, use the `stream_query` tool:
- Default batch size: 1000 rows
- Configurable batch size: 1-10,000 rows
- Maximum rows: 1,000,000

## Troubleshooting

### Connection Failed
```bash
# Test connectivity directly
vsql -h localhost -p 5433 -d VMart -U dbadmin
```

Verify:
- Host and port are reachable
- Database credentials are correct
- User has required permissions

### Permission Errors
- User needs SELECT permissions on tables
- User needs access to system catalogs (`v_catalog.*`)

### Query Timeouts
Increase timeout for complex queries:
```env
VERTICA_QUERY_TIMEOUT=300000  # 5 minutes
```

### Large Result Sets
Use `stream_query` instead of `execute_query` for queries returning >10,000 rows.

## Requirements

- Node.js >= 18.0.0
- Vertica database (any recent version)
- Network access to Vertica server

## Support

- **Issues**: [GitHub Issues](https://github.com/hechtcarmel/vertica-mcp/issues)
- **Releases**: [GitHub Releases](https://github.com/hechtcarmel/vertica-mcp/releases)

## License

MIT License - see [LICENSE](LICENSE) file.

## Acknowledgments

This project's architecture and tool design are based on [mcp-vertica](https://github.com/nolleh/mcp-vertica) by [@nolleh](https://github.com/nolleh).

---

**Current Version**: 1.3.5
