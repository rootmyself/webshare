#!/bin/bash

# Options (with default)
port="50000"
x11_port="50000"

echo "Start..."

# Arguments set
while [ "$*" ];  do
    param=$1; shift; OPTARG=$1
    case ${param} in
    -p  |--port)       port="${OPTARG}";          shift;;
    *)                                            break;;
    esac
done


# Exception handling (variable check)
# should be number
if ! [[ "$port" =~ ^[0-9]+$ ]]
    then
        echo "Error) Wrong argument: -p & --port option value is not number!"
        exit 1
fi
# range check
if [ $(($port)) -lt 1024 ]
    then
        echo "Error) Port number out of range!"
        exit 1
fi

# Main process
display=$(($port - $x11_port))

echo "kill ===> port: ${port}, display: ${display}"

# Kill Chromium
if [ $(ps -ef | grep "chromium" | grep -w "display=:${display}" | awk '{print $2}' | wc -l) -gt 0 ]
    then
        echo "Kill chromium display: ${display}"
        ps -ef | grep "chromium" | grep -w "display=:${display}" | awk '{print $2}'| xargs kill -9
fi

# Shell script finished when all process is ready 
echo "Finished!"

exit 0
