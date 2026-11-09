package com.webshare.controller;

import java.util.HashMap;

import javax.servlet.http.HttpServletRequest;

//import java.text.DateFormat;
//import java.util.Date;
//import java.util.Locale;
//
//import org.slf4j.Logger;
//import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.webshare.service.WebShareService;
import com.webshare.dto.LogInfo;

@CrossOrigin(origins = "*")
@Controller
public class UserController {
	
	@Autowired
	WebShareService service;
	
	@RequestMapping(value = "/connect/{channelId}/{user}/{width}/{height}",
					method = RequestMethod.GET)
	public String createSession(
			HttpServletRequest request,
			@PathVariable ("channelId") String channelId,
			@PathVariable ("user") String userType,
			@PathVariable ("width") String width,
			@PathVariable ("height") String height,
			@RequestParam ("url") String url) {
		
		boolean isControl = userType.equals("host") ? false : true;
		
		String clientURL = service.createSession(channelId, url, width, height, isControl, 
												 request.getRequestURL().toString());
		
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Service: "
					  	+ "connect\nChannelId: %s\nUser: %s\nUrl: %s",
				           channelId, userType, url));
		
		service.printSlotLog();
		
		// redirect? forwarding?
		return "redirect:" + clientURL;
	}
	
	@RequestMapping(value = "/connect/{channelId}/{user}", 
					method = RequestMethod.GET)
	public String enterSession(
			HttpServletRequest request,
			@PathVariable ("channelId") String channelId,
			@PathVariable ("user") String userType) {
		
		boolean isControl = userType.equals("host") ? false : true;

		String clientURL = service.enterSession(channelId, isControl, request.getRequestURL().toString());
		
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Service: "
						+ "connect\nChannelId: %s\nUser: %s",
						   channelId, userType));
		
		service.printSlotLog();
		
		// redirect? forwarding?
		return "redirect:" + clientURL;
	}
	
	@RequestMapping(value = "/disconnect/{channelId}/{user}", 
					method = RequestMethod.GET)
	public String leaveSession(
			Model model,
			@PathVariable ("channelId") String channelId,
			@PathVariable ("user") String userType) {
		
		service.leaveSession(channelId);
		
		model.addAttribute("type", "disconnect");
		
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Service: "
						+ "disconnect\nChannelId: %s\nUser: %s",
				           channelId, userType));
		
		service.printSlotLog();
		
		return "result";
	}
	
	@RequestMapping(value = "/clear/{channelId}/{user}", 
					method = RequestMethod.GET)
	public String clearSession(
			Model model,
			@PathVariable ("channelId") String channelId,
			@PathVariable ("user") String userType) {
		
		service.clearSession(channelId);
		
		model.addAttribute("type", "clear");
		
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Service: clear\nChannelId: %s\nUser: %s",
				                      channelId, userType));
		
		service.printSlotLog();
		
		return "result";
	}
	
	@RequestMapping(value = "/status/{channelId}/{user}", 
					method = RequestMethod.GET)
	@ResponseBody
	public HashMap<String, String> sessionStatus(
			Model model,
			@PathVariable ("channelId") String channelId,
			@PathVariable ("user") String userType) {
		
		String sessionStatus = service.status(channelId);
		
		LogInfo log = LogInfo.RequestType;
		log.setAndPrint(String.format("Service: status\nChannelId: %s\nUser: %s",
				                      channelId, userType));
		
		//model.addAttribute("status", result);
		//return "status";
		
		HashMap<String, String> sessionInfo = new HashMap<String, String>();
		sessionInfo.put("status", sessionStatus);
		return sessionInfo;
	}
	
}
