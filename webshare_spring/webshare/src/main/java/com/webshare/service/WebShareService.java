package com.webshare.service;

import java.net.InetAddress;
import java.net.UnknownHostException;

import org.springframework.stereotype.Service;

import com.webshare.dto.LogInfo;
import com.webshare.dto.UsingInfo;
import com.webshare.util.RequsetManager;
import com.webshare.util.SlotManager;

@Service
public class WebShareService {
	
	private final int NOVNC_PORT = 60000;
	
	public WebShareService() {
		// for remote server
		this.x11ServerIpAddr = System.getProperty("x11_addr");
		
		// for local server
		if(this.x11ServerIpAddr == null) {
			this.x11ServerIpAddr = getLocalAddr();
		}
	}
	
	public WebShareService(String localhost) {
		this.x11ServerIpAddr = localhost;
	}
	
	public String createSession(String id, String startUrl, 
			  					String width, String height, 
			  					boolean isControl, String hostUrl) {
		
		UsingInfo usingInfo = slotManager.getUsingSlot(id);
		
		if(usingInfo == null) {
			int freeSlot = slotManager.getFreeSlot();
			if(freeSlot == -1) {
				LogInfo log = LogInfo.ErrorType;
				log.setAndPrint("There is no empty slot!!");
				return "NO URL BECAUSE OF ERROR";
			}
			
			usingInfo = createNewSlot(freeSlot, id, startUrl, width, height, isControl);
		} 
		
		usingInfo.increaseUserCount();
		
		String clientUrl = String.format( 
								 convertHostUrl(hostUrl) + ":%s/vnc.html?autoconnect=true&view_only=%b",
								 (NOVNC_PORT + usingInfo.getSlotId()), isControl);
		return clientUrl;
	}
	
	public String enterSession(String id, boolean isControl, String hostUrl) {
		
		UsingInfo usingInfo = slotManager.getUsingSlot(id);
		
		if(usingInfo == null) {
			LogInfo log = LogInfo.ErrorType;
			log.setAndPrint("No Seesion Available!!");
			return "NO URL BECAUSE OF ERROR";
		} 
		
		usingInfo.increaseUserCount();
		
		convertHostUrl(hostUrl);
		String clientUrl = String.format( 
				 				convertHostUrl(hostUrl) +  "://%s:%s/vnc.html?autoconnect=true&view_only=%b",
								(NOVNC_PORT + usingInfo.getSlotId()), isControl);
		return clientUrl;
	}
		
	public void leaveSession(String id) {
		UsingInfo usingInfo = slotManager.getUsingSlot(id);
		
		if(usingInfo == null) {
			LogInfo log = LogInfo.ErrorType;
			log.setAndPrint("No Seesion Available!!");
			return;
		} 
		
		// 더이상 사용하지 않는 슬롯이면 세션 삭제 
		if(usingInfo.decreaseUserCount() == 0) {
			destorySlot(id, usingInfo);
		}
	}
	
	public void clearSession(String id) {
		UsingInfo usingInfo = slotManager.getUsingSlot(id);
		
		if(usingInfo != null) {
			destorySlot(id, usingInfo);
		}
	}
	
	public String status(String id) {
		return slotManager.getSlotStatus(id);
	}

	public void printSlotLog() {
		LogInfo log = LogInfo.VarType;
		log.setAndPrint("FREE SLOT\n" + slotManager.logFreeSlot());
		log.setAndPrint("USING SLOT\n" + slotManager.logUsingSlot());
	}
	
	
	private String getLocalAddr() {
		String localAddr = "";
		
		InetAddress local = null;
		try {
			local = InetAddress.getLocalHost();
			localAddr = local.getHostAddress();
		} catch (UnknownHostException e) {
			e.printStackTrace();
		}
		
		return localAddr;
	}
	
	private UsingInfo createNewSlot(int freeSlot,
									String id, String url, 
									String width, String height, 
									boolean isControl) {
		
		requestManager.createSession(x11ServerIpAddr, freeSlot, url, width, height);
		slotManager.addUsingSlot(id, freeSlot);
		UsingInfo newSlotInfo = slotManager.getUsingSlot(id);
		
		LogInfo log = LogInfo.AlartType;
		log.setAndPrint(String.format("Free slot: %d\nCreate slot!", freeSlot));
		
		return newSlotInfo;
	}
	
	private void destorySlot(String id, UsingInfo slotInfo) {
		requestManager.killSession(x11ServerIpAddr, slotInfo.getSlotId());
		slotManager.removeUsingSlot(id);
		slotManager.addFreeSlot(slotInfo.getSlotId());
	}
	
	// 필요한 url만 남기고 제거한.
	private String convertHostUrl(String hostUrl) {
		String[] partialInfo = hostUrl.split(":");
		String protocol = partialInfo[0];	// 'http', 'https'
		String mainUrl = partialInfo[1];    // '//www.naver.com'
		return protocol + ":" + mainUrl; // 'https://www.naver.com'
	}
	
	private RequsetManager requestManager = RequsetManager.getInstance();
	private SlotManager slotManager = SlotManager.getInstance();
	
	private String x11ServerIpAddr;
}
