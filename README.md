# Vertica MCP Server

A Model Context Protocol (MCP) server that enables AI assistants like Claude and Cursor to interact with Vertica databases safely and efficiently.

## 🔒 Safety First

By default, this server operates in **readonly mode** to ensure database safety in production environments. You can optionally enable write operations when needed.

## ✨ Key Features

- **🔒 Configurable Safety**: Readonly by default, with optional write operations
- **🏗️ Complete Schema Discovery**: Explore tables, views, and database structure
- **📊 Flexible Query Execution**: Run SQL queries with parameter support
- **🌊 Efficient Streaming**: Handle large datasets with batch processing
- **⚡ High Performance**: Optimized for Vertica's columnar architecture
- **🛡️ Enterprise Ready**: SSL support, connection pooling, and error handling

## 🚀 Quick Start

### For Cursor Users

1. **Create environment file** (`~/.cursor/vertica.env`):
```env
VERTICA_HOST=your-vertica-host.com
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=your_username
VERTICA_PASSWORD=your_password
```

2. **Configure Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp@1.3.5",
        "--env-file",
        "/Users/yourusername/.cursor/vertica.env"
      ]
    }
  }
}
```

3. **Restart Cursor** and start querying your database!

### For Claude Desktop

Add to your Claude configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "@hechtcarmel/vertica-mcp@1.3.5",
        "--env-file",
        "/path/to/your/.env"
      ]
    }
  }
}
```

## ⚙️ Configuration

Create a `.env` file with your database connection details:

```env
# Required: Database Connection
VERTICA_HOST=localhost
VERTICA_PORT=5433
VERTICA_DATABASE=VMart
VERTICA_USER=dbadmin
VERTICA_PASSWORD=your_password

# Optional: Safety Settings
VERTICA_READONLY_MODE=true          # Default: true (readonly only)

# Optional: Performance Settings
VERTICA_CONNECTION_LIMIT=10         # Default: 10
VERTICA_QUERY_TIMEOUT=60000         # Default: 60 seconds

# Optional: Security Settings
VERTICA_SSL=false                   # Default: false
VERTICA_SSL_REJECT_UNAUTHORIZED=true # Default: true

# Optional: Default Schema
VERTICA_DEFAULT_SCHEMA=public       # Default: public
```

### Safety Configuration

- **Readonly Mode (Default)**: Only `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and `WITH` queries are allowed
- **Write Mode**: Set `VERTICA_READONLY_MODE=false` to enable all SQL operations (INSERT, UPDATE, DELETE, CREATE, DROP, etc.)

## 🔧 Available Operations

### Query Execution
- **execute_query**: Run SQL queries with optional parameters
- **stream_query**: Handle large result sets with efficient batching

### Schema Discovery
- **get_table_structure**: Detailed table information with columns and constraints
- **list_tables**: All tables in a schema with metadata
- **list_views**: All views with definitions
- **list_indexes**: Vertica projections (indexes) for query optimization

## 💡 Usage Examples

### Basic Data Analysis
```sql
-- Customer analysis
SELECT customer_state, COUNT(*) as customer_count 
FROM customer_dimension 
GROUP BY customer_state 
ORDER BY customer_count DESC 
LIMIT 10;

-- Sales trends
SELECT DATE_TRUNC('month', sale_date_key) as month,
       SUM(sales_quantity) as total_sales
FROM store_sales_fact 
WHERE sale_date_key >= '2023-01-01'
GROUP BY month
ORDER BY month;
```

### Schema Exploration
```sql
-- Show all tables
SHOW TABLES;

-- Describe table structure
DESCRIBE customer_dimension;

-- Query performance analysis
EXPLAIN SELECT * FROM store_sales_fact WHERE sale_date_key > '2023-01-01';
```

### Large Dataset Handling
Use `stream_query` for large datasets:
- Automatically batches results (default: 1000 rows per batch)
- Configurable batch size and row limits
- Memory-efficient processing

## 🔐 Security Features

### Readonly Protection
- **SQL Validation**: Only approved query types are executed
- **Parameter Binding**: Protection against SQL injection
- **Connection Limits**: Prevent resource exhaustion

### Production Safety
- **Error Handling**: Graceful failure with detailed logging
- **Connection Cleanup**: Automatic resource management
- **SSL Support**: Encrypted connections to your database

## 🏢 Enterprise Features

### Vertica Optimizations
- **Projection Awareness**: Leverage Vertica's columnar projections
- **Batch Processing**: Efficient handling of large analytical queries
- **Connection Pooling**: Optimized connection management

### Performance
- **Query Timeouts**: Configurable timeout settings
- **Streaming Results**: Handle million-row datasets efficiently
- **Smart Batching**: Automatic optimization for large queries

## 📊 Use Cases

### Data Analysis
- Explore customer behavior patterns
- Analyze sales trends and performance
- Generate business intelligence reports

### Schema Management
- Document database structure
- Understand table relationships
- Optimize query performance

### AI-Assisted Development
- Generate SQL queries through natural language
- Validate data models and constraints
- Prototype and test analytical queries

## 🚨 Troubleshooting

### Connection Issues
```bash
# Test database connectivity
vsql -h localhost -p 5433 -d VMart -U dbadmin
```

### Permission Problems
- Ensure database user has SELECT permissions
- Check access to system catalogs (`v_catalog.*`)
- Verify network connectivity to Vertica host

### Performance Issues
- Increase `VERTICA_QUERY_TIMEOUT` for complex queries
- Use `stream_query` for large result sets
- Optimize batch sizes based on available memory

## 📈 Version History

### v1.3.5 (Latest)

- Fixed version string issue that caused MCP tools to not be enabled

### v1.3.4
- **🆕 Configurable Readonly Mode**: Enable/disable write operations
- **📝 Enhanced Documentation**: Professional user-focused guide
- **🔧 Improved Error Messages**: Clear guidance for configuration issues
- **🐛 Fixed**: Corrected v1.3.1 publishing issue

### v1.3.0
- Initial release with configurable readonly mode

### v1.2.x
- Stable readonly operations
- Comprehensive tool set
- Production-ready reliability

## 🆘 Support

For issues and questions:
- **GitHub Issues**: [Report problems](https://github.com/hechtcarmel/vertica-mcp/issues)
- **Documentation**: This README covers most common scenarios
- **Community**: Share usage patterns and best practices

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to get started?** Copy the configuration examples above and start exploring your Vertica database with AI assistance! 