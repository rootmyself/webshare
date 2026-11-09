#!/bin/bash

# Const value
novnc_dir="/usr/webshare/release/noVNC"

# Options (with default)
x11_ip="127.0.0.1"
client_num="4"
x11_port="50000"
noVNC_port="60000"

echo "Kill running process..."
ps -ef | grep websockify | awk '{print $2}' | xargs kill -9
sleep 1

echo "Start server..."

# Arguments set
while [ "$*" ];  do
    param=$1; shift; OPTARG=$1
    case ${param} in
    -cl |--client)     client_num="${OPTARG}";    shift          ;;
    -p  |--port)       x11_port="${OPTARG}";      shift          ;;
    -ip |--ip)         x11_ip="${OPTARG}";        shift          ;;
    *)                                            break          ;;
    esac
done

# Extract current network IP 
# if [[ "$x11_ip" == "" ]]
#     then
#         x11_ip=`hostname -I | awk '{print $1}'`
# fi
# echo $host_ip

echo "Setting ${client_num} clients on server"
echo "Set port automatically start with ${x11_port}"

# Exception handling (variable check)
# should be number
if ! [[ "$client_num" =~ ^[0-9]+$ ]]
    then
        echo "Error) Wrong argument: -cl & --client option value is not number!"
        exit 1
fi
if ! [[ "$x11_port" =~ ^[0-9]+$ ]]
    then
        echo "Error) Wrong argument: -p & --port option value is not number!"
        exit 1
fi
# range check
if [ $(($client_num)) -le 0 ]
    then
        echo "Error) Client number out of range!"
        exit 1
fi
if [ $(($x11_port)) -lt 1024 ]
    then
        echo "Error) Port number out of range!"
        exit 1
fi

# should be ip type
if ! [[ "$x11_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
    then
        echo "Error) Wrong host IP: Check your internet status or argument type!"
        exit 1
fi


# Function : Wait for initialization 
# Main process
for (( var=0; var<${client_num}; ++var ))
do
    # Run noVNC Server (websockify)
    # port -> start with 60000
    ${novnc_dir}/websockify/run --web ${novnc_dir} --ssl-only $(($noVNC_port+$var)) ${x11_ip}:$(($x11_port+$var)) &
  
done

# Shell script finished when all process is ready 
echo "Finished!"

exit 0
