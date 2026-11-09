#!/bin/bash

# kill node.js Server
killall -9 node

# kill tomcat Server
bash /usr/tomcat/bin/shutdown.sh

# Kill all X11 Process
bash /usr/webshare/release/x11_clean.sh

# Kill noVNC Server
ps -ef | grep websockify | awk '{print $2}' | xargs kill -9

exit 0
