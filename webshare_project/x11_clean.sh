#!/bin/bash

echo "Start clean..."

# Main process
echo "kill ===> All"

# Kill all Xvfb
killall Xvfb
# ps -ef | grep Xvfb | awk '{print $2}' | xargs kill -9
# x11vnc and browser will be closed when Xvfb has been killed
#  x11vnc   #  browser

# remove .lock files
find /tmp/ -name ".X*-lock" 2> /dev/null -delete

# Shell script finished when all process is ready 
echo "Finished"

exit 0
