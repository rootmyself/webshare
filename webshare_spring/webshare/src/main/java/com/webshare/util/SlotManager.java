package com.webshare.util;

import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;

import com.webshare.dto.UsingInfo;


public class SlotManager {
	
	static final int CLIENT_COUNT = 100;

	/* singleton initialize */
	private static SlotManager instance = new SlotManager(System.getProperty("client_count"));
	
	private SlotManager(String count) {
		
		int slotSize = CLIENT_COUNT;
		
		if(count != null) 
			slotSize = Integer.parseInt(count);

		for(int i = 0; i < slotSize; ++i) {
			free_slot.add(i);
		}
	}
	
	public static SlotManager getInstance() {
		return instance;
	}
	
	/* log recorder */
	public String logFreeSlot() {
		StringBuilder slotLog = new StringBuilder();
		
	    int count = 0;
		slotLog.append("[ ");
		for(Integer slot : free_slot) {
			slotLog.append(String.format("%d, ", slot));
			if(++count > 10) {
				slotLog.append("\n");
				count = 0;
			}
		}
		slotLog.append(" ]");
		
		return slotLog.toString();
	}
	
	public String logUsingSlot() {
		StringBuilder slotLog = new StringBuilder();
		
		for(Map.Entry<String, UsingInfo> entry : using_slot.entrySet()) {
			String info = String.format(
					 				"{ ChannelId: %s, Using slot: %d, Count: %d},\n",
									entry.getKey(), 
									entry.getValue().getSlotId(), 
									entry.getValue().getUserCount() );
			slotLog.append(info);
		}
		
		return slotLog.toString();
	}
	
	/* function */
	public String getSlotStatus(String id) {	// 슬롯 상태 (사용가능한 슬롯이 있는지 없는지)
		String status = "free";
		
		if(getUsingSlot(id) != null) {
			status = "using";
		} else if(free_slot.isEmpty()){
			status = "busy";
		}
		
		return status;
	}
	
	public void addFreeSlot(int slot) {
		free_slot.add(slot);
	}
	
	public int getFreeSlot() { // 사용가능한 슬롯을 가져온다 (없는경우 -1)
		Integer slot = -1;
		
		if(free_slot.peek() != null) {
			try {
				slot = free_slot.take();
			} catch(InterruptedException e) {
				e.printStackTrace();
			}
		}
		
		return slot;
	}
	
	public UsingInfo getUsingSlot(String id) { // 현재 id가 사용중인 슬롯 정보를 가져온다 (없는경우null)
		if(!using_slot.containsKey(id)) {
			return null;
		}
		
		return using_slot.get(id);
	}
	
	public void addUsingSlot(String id, int slot) { // 사용중인 슬롯으로 관리한다 (사용 시작)
		using_slot.put(id, new UsingInfo(slot));
	}
	
	public void removeUsingSlot(String id) {	// 사용중인 슬롯을 지운다 (사용 종료) 
		using_slot.remove(id);
	}
	
	/* value */
	/* synchronized variable (thread-safe) */
	private BlockingQueue<Integer> free_slot 
				= new ArrayBlockingQueue<Integer>(CLIENT_COUNT);
	
	private ConcurrentHashMap<String, UsingInfo> using_slot 
				= new ConcurrentHashMap<String, UsingInfo>();
}
