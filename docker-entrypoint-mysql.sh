#!/bin/bash
# Wrapper script to handle MySQL initialization when DB_USER might be "root"
# MySQL doesn't allow MYSQL_USER to be set to "root"

# If DB_USER is "root", unset MYSQL_USER and MYSQL_PASSWORD
# so MySQL only creates the root user
if [ "${DB_USER}" = "root" ]; then
  unset MYSQL_USER
  unset MYSQL_PASSWORD
fi

# Call the original MySQL entrypoint
exec /entrypoint.sh "$@"


