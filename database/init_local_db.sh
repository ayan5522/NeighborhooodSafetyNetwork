#!/bin/bash
set -e

# Set listen_addresses to '*'
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/18/main/postgresql.conf

# Add trust/md5 rule to pg_hba.conf for localhost
grep -q "nsn_app_user" /etc/postgresql/18/main/pg_hba.conf || echo "host    all             nsn_app_user    127.0.0.1/32            scram-sha-256" >> /etc/postgresql/18/main/pg_hba.conf
grep -q "nsn_app_user" /etc/postgresql/18/main/pg_hba.conf || echo "host    all             nsn_app_user    ::1/128                 scram-sha-256" >> /etc/postgresql/18/main/pg_hba.conf
grep -q "all             all             127.0.0.1/32" /etc/postgresql/18/main/pg_hba.conf || echo "host    all             all             127.0.0.1/32            scram-sha-256" >> /etc/postgresql/18/main/pg_hba.conf
grep -q "all             all             ::1/128" /etc/postgresql/18/main/pg_hba.conf || echo "host    all             all             ::1/128                 scram-sha-256" >> /etc/postgresql/18/main/pg_hba.conf

/usr/bin/pg_ctlcluster 18 main reload || /usr/sbin/service postgresql restart

# Create user and database
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='nsn_app_user'\" | grep -q 1 || psql -c \"CREATE USER nsn_app_user WITH PASSWORD 'nsn_password_2026' SUPERUSER;\""
su - postgres -c "psql -c \"ALTER USER nsn_app_user WITH PASSWORD 'nsn_password_2026' SUPERUSER;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='neighborhood_safety_db'\" | grep -q 1 || psql -c \"CREATE DATABASE neighborhood_safety_db OWNER nsn_app_user;\""
su - postgres -c "psql -d neighborhood_safety_db -c \"CREATE EXTENSION IF NOT EXISTS postgis;\""

echo "Local PostgreSQL + PostGIS initialization completed."
