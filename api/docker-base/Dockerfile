# Build:                   sudo docker build --no-cache . -t cacophonyproject/server-base:latest
# Run interactive session: sudo docker run -it cacophony-api

FROM ubuntu:22.04
WORKDIR /app
# NOTE, we're putting the docker actions inside a shell script so it all gets run as a single layer,
#  which dramamtically reduces the size of the final docker image.
COPY package.json ./
COPY run.sh ./
RUN /app/run.sh && rm -rf /app/run.sh
#RUN /app/run.sh arm64 && rm -rf /app/run.sh

