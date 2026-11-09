package com.webshare.util;

import java.net.URL;

import java.net.URLConnection;

import com.webshare.dto.LogInfo;

public class RequsetManager {
	
	static final int PORT = 3000;
	static final int X11PORT = 50000;
	
	/* singleton initialize */
	private static RequsetManager instance = new RequsetManager();
	
	private RequsetManager() {}
	
	public static RequsetManager getInstance() {
		return instance;
	}
	
	public void createSession(String server, int slot, String url, String width, String height) {
		String requestUrl = String.format(
				"http://%s:%d/create?port=%d&url=%s&width=%s&height=%s", 
				server, PORT, (X11PORT + slot), url, width, height);
		
		request(requestUrl);
	}
	
	public void killSession(String server, int slot) {
		String requestUrl = String.format(
				"http://%s:%d/kill?port=%d", 
				server, PORT, (X11PORT + slot));
		
		request(requestUrl);
		
	}
	
	public void clearAllSessions(String server) {
		String requestUrl = String.format("http://%s:%d/clean", server, PORT);
		
		request(requestUrl);
	}
	
	private void request(String url) {
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Request to X11 WAS\nURL: %s", url));
		
		try {
			URL obj = new URL(url);
			URLConnection conn = obj.openConnection();
			conn.getInputStream();
		} catch(Exception e) {
			e.printStackTrace();
		}
	}
}
