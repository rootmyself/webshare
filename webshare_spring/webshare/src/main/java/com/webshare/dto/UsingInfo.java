package com.webshare.dto;

public class UsingInfo {
	public UsingInfo(int slotId) {
		this.slotId = slotId;
	}
	
	public int increaseUserCount() {
		return ++userCount;
	}
	public int decreaseUserCount() {
		return --userCount;
	}
	
	public int getSlotId() {
		return slotId;
	}
	
	public int getUserCount() {
		return userCount;
	}
	
	private int slotId;
	private int userCount = 0;
}
