package com.webshare.dto;

public enum LogInfo {
	ErrorType  ("----------------------   Error   ----------------------"),
	VarType    ("----------------------  Variable ----------------------"),
	RequestType("----------------------  Request  ----------------------"),
	AlartType  ("----------------------   Alart   ----------------------")
	;

	private static final boolean LOG_ENABLE = true;
	
	private final String type;
	private String message;
	
	LogInfo(String type) {
		this.type = type;
	}
	
	public void setAndPrint(String message) {
		setMessage(message);
		print();
	}
	
	public void setMessage(String message) {
		this.message = message;
	}
	
	public void print() {
		if(LOG_ENABLE) {
			System.out.println(type);
			System.out.println(message);
			System.out.println();
		}
	}
}
