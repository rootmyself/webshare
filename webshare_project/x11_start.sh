#!/bin/bash

# Options (with default)
port="50000"
x11_port="50000"
resolution="1920x1920"
url="www.google.com"

# Chromium Extensions
EXTENSION_PATH="~/.config/chromium/Default/Extensions"
OPEN_LINK_WITH_NO_NEW_TAB="kgpefningcojblgciiljmabggbbjiojb/1.14_0"

echo "Start..."

# Arguments set
while [ "$*" ];  do
    param=$1; shift; OPTARG=$1
    case $param in
    -c   |--connect)    connect_type="${OPTARG}";    shift ;;
    -i   |--internet)   internet_type="${OPTARG}";   shift ;;
    -r   |--resolution) resolution="${OPTARG}";      shift ;;
    -p   |--port)       port="${OPTARG}";            shift ;;    
    -u   |--url)        url="${OPTARG}";             shift ;;
    *)                                               break ;;
    esac
done

# Extract resolution width & height
width=`echo ${resolution}|cut -d'x' -f1`
height=`echo ${resolution}|cut -d'x' -f2`


# Exception handling (variable check)
# should be number
if ! [[ "$port" =~ ^[0-9]+$ ]]
    then
        echo "Error) Wrong argument: -p & --port option value is not number!"
        exit 1
fi

# should be resolution type
if ! [[ "$resolution" =~ ^[0-9]+x[0-9]+$ ]]
    then
        echo "Error) Wrong resolution value: -r & --resolution option value should be like [W]x[H]!"
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

echo "start chromium ===> port: ${port}, display: ${display}, url: ${url}"

# Resize X11VNC Frame Buffer 
DISPLAY=:$display xrandr --fb ${width}x${height} &

# Run browser
#DISPLAY=:$display chromium --temp-profile --kiosk --window-size=$width,$height --window-position=0,0 -url $url --display=:$display &
DISPLAY=:$display chromium --temp-profile --kiosk \
--window-size=$width,$height --window-position=0,0 \
--disable-features=TranslateUI --user-agent=iPad \
--load-extension="$EXTENSION_PATH/$OPEN_LINK_WITH_NO_NEW_TAB" \
--app=http://$url --no-sandbox --display=:$display  &

# --disable-gpu

# Shell script finished when all process is ready 
echo "Finished!"

exit 0
