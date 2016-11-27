# Backend for Outing Buddy

People don't utilize their spare time efficiently. When they do find themselves with a few hours to spare that they want to devote to exploration of their area, oftentimes they get bogged down in planning and stuck on sites like Yelp and Foursquare. This detracts from time that they could be spending on the outing itself. This application intends to solve that problem by providing local, curated outings to users who provide a few specifications for the outing when they open the app. This repository contains the backend functionality for the application.  

-Our API currently includes the following routes and functionality:  
**/signup:** Creates a new user  
**/signin:** Validates phone number and password and returns a session token  
**/outing:** Generates an outing which accounts for specified parameters (duration, location, participants, etc)  
**/reflection:** Records an entry regarding a completed outing, provided by the user at the end of the outing  
**/step:** Receives steps submitted by a user and stores them in the database to be provided to new users  

-Server.js also includes commented-out code from our rudimentary SMS bot, which we used in an initial study to gather data for our thesis. The bot prompted users for entries of their best, most recent experiences every three days, and also responded to user's requests for various outings around the area. 