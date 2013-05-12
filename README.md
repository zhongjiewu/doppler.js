This is a javascript that tracks user activities on the brower and report it to server
1. It listens to multiple page events and saves on to the event queue 
2. It periodiclly flush the event queue by flatening the events structure and encode it before sending to server
3. It saves unflushed events to localStorage (if available) or cookie when the page unloads
4. It import saved events from localStorage and cookie and flush them to the server
5. The events are encoded if client base64 encoding is supported
