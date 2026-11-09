#!/bin/bash

# kill auto service
bash /usr/webshare/release/auto_stop.sh
timeout=5
echo "stop auto service..."
while [ $timeout -gt 0 ];
do
    echo "wait for $timeout sec"
	sleep 1
	((timeout -= 1))
done

client_count=50
resolution="1920x1920x16"
start_port="50000"

ip_slot=1

# Arguments set
while [ "$*" ];  
do
    param=$1; shift; OPTARG=$1
    case $param in
    -cl   |--client)     client_count="${OPTARG}";   shift ;;
    -r    |--resolution) resolution="${OPTARG}";     shift ;;
    -s    |--ipSlot)     ip_slot="${OPTARG}";        shift ;;
    *)                                               break ;;
    esac
done

host_ip=`hostname -I | awk -v slot="$ip_slot" '{print $slot}'`

# range check
if [ $(($client_count)) -gt 100 ]
    then
        echo "Error) Too many sessions to create!"
        exit 1
fi

# init uim
export GTK_IM_MODULE="uim"
export QT_IM_MODULE="uim"
export XMODIFIERS="@im=uim"

## INIT X11 ##
# run xvfb by count
for (( var=0; var<${client_count}; ++var ))
do
    Xvfb :$var -screen 0 ${resolution} & 
done
echo "Create Xvfb Done!"

# wait for Xvfb start
# Xvfb는 실행시 .X*-lock 형식의 파일이 tmp 폴더에 생성된다.
# 이를 카운트하여 Xvfb가 모두 실행되었는지 확인한다.
# (waiting limit 10sec)
timeout=10
while [ $timeout -gt 0 -a $client_count -gt $(ls -al /tmp/ | grep 'X[0-9]' | grep -w 'lock$' | wc -l) ];
do
    echo "################### Wait... Xvfb Count #####################"
    echo $(ls -al /tmp/ | grep 'X[0-9]' | grep -w 'lock$' | wc -l)
    echo ""
	sleep 1
	((timeout -= 1))
done

timeout=3
echo "temp wait for xvfb..."
while [ $timeout -gt 0 ];
do
    echo "wait for $timeout sec"
	sleep 1
	((timeout -= 1))
done

# run uim, x11vnc by count 
for (( var=0; var<${client_count}; ++var ))
do
    DISPLAY=:$var GTK_IM_MODULE=uim
    DISPLAY=:$var QT_IM_MODULE=uim
    DISPLAY=:$var XMODIFIERS=@im=uim
    DISPLAY=:$var uim-xim &

    x11vnc -display :$var -shared -forever -nopw -rfbport $(($var + $start_port)) &
done
echo "Create uim, x11vnc Done! "


# start(kill when they are already running) noVNC Server(websockify)
bash /usr/webshare/release/noVNC_server.sh -cl $client_count -ip $host_ip &
echo "Create noVNC Server Done! "

#  start x11 WAS Server
npm run start --prefix /usr/webshare/release/x11_server &
echo "Create x11 WAS Done! "

# start noVNC WAS Server
#npm run start --prefix $HOME/noVNC_server -- $client_count &

# start tomcat Server
# client_count
export JAVA_OPTS="$JAVA_OPTS -Dclient_count=$client_count"
export JAVA_OPTS="$JAVA_OPTS -Dx11_addr=$host_ip"
# ip settings (by array)
bash /usr/tomcat/bin/startup.sh
echo "Create noVNC WAS Done! "


