# Build:                   sudo docker build --no-cache . -t cacophony-web
# Run interactive session: sudo docker run -it cacophony-web

FROM cacophonyproject/server-base:latest

WORKDIR /app

# API
EXPOSE 1080

# API - fileProcessing
EXPOSE 2008

# Minio
EXPOSE 9001

# Node Debugger
EXPOSE 9229

# PostgreSQL
EXPOSE 5432

# Mailserver test server
EXPOSE 8888

COPY docker-entrypoint.sh /
ENTRYPOINT ["/docker-entrypoint.sh"]
