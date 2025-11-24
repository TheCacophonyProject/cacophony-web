# syntax=docker/dockerfile:experimental
ARG BASE_IMAGE=ubuntu:24.04
FROM --platform=$TARGETPLATFORM ${BASE_IMAGE} AS base
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
# NOTE, we're putting the docker actions inside a shell script so it all gets run as a single layer,
#  which dramamtically reduces the size of the final docker image.
COPY package.json ./
COPY run.sh ./
RUN chmod +x ./run.sh
RUN ./run.sh && rm -rf ./run.sh
