TheSportsDB API Documentation
Introduction
Welcome to TheSportsDB API, your ultimate destination for seamless access to free, real-time sports data. Whether you're building an app, running a fantasy league, or simply want to stay updated with live scores, player stats, team standings, or match schedules, our powerful and easy-to-use API has you covered. With support for a wide range of sports and leagues worldwide, TheSportsDB API is designed for developers, enthusiasts, and startups looking to integrate reliable sports data without the hassle of expensive subscriptions. Get started today and bring the game to life in your application!


Free vs Premium
We offer a free API that anyone can use. The site originally had all methods available to use under the free API with no limits, but sadly it became too popular and was abused. So over the years we have had to limit certain methods, while trying to keep the core functionality. The Free API should work in many use cases, so please do test it out.

The current free API key is: 123
Premium API keys can be found on your user profile, once upgraded.

The Premium API includes all methods in V1 with larger limits as well as some extra stuff like livescores and video highlight links. Premium also allows you to use the more modern V2 API. You can find your Premium API key on your user profile if you are a supporter.




API v1 vs v2
The v1 API was written over 10 years ago and has been addded to since with many extra features. It uses basic PHP code to produce JSON objects that are returned to the user. API users are authenticated with a simple numeric API key in the URL. The naming is a little messy and the authentication is not great, as the key is visible to anyone who wants to poke around your web requests. Saying that, it works and is simple to use and easy to test in any web browser. Ideal for beginners!

V2 API is more modern and verbous API. This means it should be easier to understand in a logical way. It also uses more modern authentication requiring the API key to be sent in the header. When something goes wrong, the API will return standard HTTP response codes. V2 is only for premium subscribers and will be the only version developed going forward.


Base URL
The Base URL is a crucial element for making API calls, enabling you to clearly specify the root URL(s) for API requests. When making API calls, you combine the base URL with the specific endpoint path to form the complete request URL.

v1 Base URL = https://www.thesportsdb.com/api/v1/json
v2 Base URL = https://www.thesportsdb.com/api/v2/json


V1 Authentication
v1 of the API has a very simple authentication process. Simply use the base URL above and append the number /123/ to the URL for the test key or replace with your premium API key.

Using the free key:
https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Arsenal
Using your premium API key:
https://www.thesportsdb.com/api/v1/json/YOUR_API_KEY_GOES_HERE/searchteams.php?t=Arsenal
You can see an example below using a simple web browser using the free '123' API key:

Httpie Example Auth

V2 Authentication
v2 takes a more secure, modern approach to Authentication.
When sending a request to the API base URL, you must include API key in the header using this attribute 'X-API-KEY'.

You can see an example below using the popular free API testing software: Httpie

Httpie Example Auth


Images
Our site has a huge amount of images for things like events, players and teams. Most are fan created.
There are 2 types of images available. JPEG fanart and transparent PNG mostly used for badges and logos.
You can see the different types of artwork and sizes on this page.
You can access any image from the front-end using the image URL from the returned JSON data.

Preview Images
Most of the time you won't want to download the original large image, just get a small preview.
This is possible simple by appending '/medium', '/small', '/tiny' onto the end URL. This will give you a smaller version.

Original 720px- /league/fanart/xpwsrw1421853005.jpg
Medium version of league fanart
Medium 500px - /league/fanart/xpwsrw1421853005.jpg/medium
Medium version of league fanart
Small 250px - /league/fanart/xpwsrw1421853005.jpg/small
Small version of league fanart
Tiny 50px - /league/fanart/xpwsrw1421853005.jpg/tiny
Tiny version of league fanart


Rate Limit
The site has different rate limits for different levels of users. You will recieve a "429" http header if you breach the limit, then you will need to wait another minute until requests will work again. We enforce these not just to differentiate our tiers, but to keep the overall performance of the site stable.

arrow list Free users 30 requests per minute.
arrow list Premium 100 per minute
arrow list Business 120 per minute

seperator bar

V1 API Documentation

 v1 API Search
Most API requests will start with a string search. Examples of this may be to find a team or player details.
All searches will return the entities data but also an ID number which can be used for later faster lookups.

Search Teams
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Search for any sports team by its name. {strTeam}
https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Arsenal

Search Events:
Type:  Parameter: 
Type:  Parameter: 
Type:  Parameter: 
Free Limit:  Premium Limit: 
Example: JSON Data
Example with season: JSON Data
Example with date: JSON Data
Example with filename: JSON Data
Description: Search for any sports event by it's title with extra filters for season, date or filename: {strEvent}
Optional strings: {strSeason} {strDate} {strFilename}
https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=Arsenal_vs_Chelsea
https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=Arsenal_vs_Chelsea&s=2016-2017
https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=Arsenal_vs_Chelsea&d=2015-04-26
https://www.thesportsdb.com/api/v1/json/123/searchevents.php?f=English_Premier_League_2015-04-26_Arsenal_vs_Chelsea

Search Players:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Description: Search for any sports person by their main or alternate name. {strPlayer}
https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Danny_Welbeck

Search Venues:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Description: Search any venue by its name or alternate name {strVenue}
https://www.thesportsdb.com/api/v1/json/123/searchvenues.php?v=Wembley

seperator bar


 v1 API Lookup
While the string search is useful above to find things, it is actually much quicker and simpler to retrieve data using the unique ID.
Lookups will return all data from that entity, you can find any ID by simply looking at the frontend websites URL usually.
For example the British Premier League's ID is 4328, or Formula 1's is 4370.

Lookup League:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a leagues details using its ID {idLeague}
https://www.thesportsdb.com/api/v1/json/123/lookupleague.php?id=4328

Lookup League Table:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a current league points table using its ID: {idLeague} Optional: {strSeason} (*Limited to featured soccer leagues ONLY)
https://www.thesportsdb.com/api/v1/json/123/lookuptable.php?l=4328
https://www.thesportsdb.com/api/v1/json/123/lookuptable.php?l=4328&s=2020-2021

Lookup Team
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a teams details using its ID. {idTeam}
https://www.thesportsdb.com/api/v1/json/123/lookupteam.php?id=133604

Lookup Team Equipment
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a teams historical and current equipment using its ID. {idTeam}
https://www.thesportsdb.com/api/v1/json/123/lookupequipment.php?id=133597

Lookup Player
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a players details using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/lookupplayer.php?id=34145937

Lookup Player Honours
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all honours for a player using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/lookuphonours.php?id=34147178

Lookup Player Former Teams
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all former teams for a player using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/lookupformerteams.php?id=34147178

Lookup Player Milestones
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all Milestones for a player using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/lookupmilestones.php?id=34161397

Lookup Player Contracts
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all contracts for a player using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/lookupcontracts.php?id=34147178

Lookup Player Results
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all results for a player using their ID. {idPlayer}
https://www.thesportsdb.com/api/v1/json/123/playerresults.php?id=34160573

Lookup Event
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a teams details using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=441613

Lookup Event Results
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all results for an event using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/123/eventresults.php?id=652890

Lookup Event Lineup
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup the team lineups for an event using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/123/lookuplineup.php?id=1032723

Lookup Event Timeline
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup the timeline for an event using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/123/lookuptimeline.php?id=1032718

Lookup Event Statistics
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup the statistics for an event using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/123/lookupeventstats.php?id=1032723

Lookup Event TV Broadcasts
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup all TV channels showing an event using its ID. {idEvent}
https://www.thesportsdb.com/api/v1/json/3/lookuptv.php?id=584911

Lookup Venue
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Lookup a team using its ID. {idTeam}
https://www.thesportsdb.com/api/v1/json/123/lookupvenue.php?id=16163


seperator bar


 v1 API List
Using the list API means we can return more than one record.
This can be useful for example to list sports or countries

All Sports:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
List all the sport categories supported on the website.
https://www.thesportsdb.com/api/v1/json/123/all_sports.php

All Countries:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
List all the geographical countries supported on the website.
https://www.thesportsdb.com/api/v1/json/123/all_countries.php

All Leagues:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
List all the leagues on TheSportsDB.
https://www.thesportsdb.com/api/v1/json/123/all_leagues.php

List Leagues:
Type:  Parameter:  The country name
Type:  Parameter:  The sport name
Free Limit: limit: Premium Limit: 
Example: JSON Data
List all the leagues in a country for a specific sport. {strCountry} {strSport}
https://www.thesportsdb.com/api/v1/json/123/search_all_leagues.php?c=England&s=Soccer

List Seasons:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
Example2: JSON Data
Example3: JSON Data
Example4: JSON Data
List all the seasons available for a specific league ID. {idLeague}
https://www.thesportsdb.com/api/v1/json/123/search_all_seasons.php?id=4328
https://www.thesportsdb.com/api/v1/json/123/search_all_seasons.php?id=4328&poster=1
https://www.thesportsdb.com/api/v1/json/123/search_all_seasons.php?id=4328&badge=1
https://www.thesportsdb.com/api/v1/json/123/search_all_seasons.php?id=4328&description=1

List Teams:
Type:  Parameter: 
Type:  Parameter: 
Type:  Parameter: 
Free Limit:  Premium Limit: 
Example: JSON Data
Example2: JSON Data
List all the teams in a specific league by the leagues name, country and sport or ID. {strLeague} {strCountry} {strSport}
https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=English_Premier_League
https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?s=Soccer&c=Spain

List Players:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
List all the Players who play for a team by the teams ID. {idTeam}
https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=133604


seperator bar


 v1 API Schedule
The Schedule API allows you to look up past, present and future events.
It includes the ability to lookup entire seasons as well as the just a few of the next and past events.

Schedule Team Next:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
See the next few upcoming events for a team using the Team ID. *free key only shows home event
https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=133602

Schedule Team Previous:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
See the last few recent events for a team using the Team ID. *free key only shows home event
https://www.thesportsdb.com/api/v1/json/123/eventslast.php?id=133602

Schedule League Next:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
See the next upcoming events for a team using the league ID.
https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4328

Schedule League Previous:
Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
See the next upcoming events for a team using the league ID. {idLeague}
https://www.thesportsdb.com/api/v1/json/123/eventspastleague.php?id=4328

Schedule Day:
Type:  Parameter: 
Type:  Parameter (Optional): 
Type:  Parameter (Optional): 
Free Limit:  Premium Limit: 
Example: JSON Data
Example2: JSON Data
Example3: JSON Data
See the events on a specific day in the future, past or present.
You can also add an optional filter for league ID. {dateEvent} {strSport} {strLeague}
https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2014-10-10
https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2014-10-10&s=Baseball
https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2014-10-10&l=MLB

Schedule Season:
Type:  Parameter:  Type:  Parameter:  Free Limit:  Premium Limit: 
Example: JSON Data
See all the events for a particular season and filter by league ID. {idSeason} {strSeason}
https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4328&s=2014-2015

Schedule TV:
Type:  Parameter:  Type:  Parameter:  Type:  Parameter:  Type:  Parameter:  Type:  Parameter:  Type:  Free Limit:  Premium Limit: 
Example: JSON Data
Example2: JSON Data
Example3: JSON Data
Example4: JSON Data
Example5: JSON Data
See the TV schedual for a particular date. {dateEvent} {strSport} {strCountry} {strChannel} {idChannel}
https://www.thesportsdb.com/api/v1/json/123/eventstv.php?d=2024-07-07
https://www.thesportsdb.com/api/v1/json/123/eventstv.php?d=2018-07-07&s=Fighting
https://www.thesportsdb.com/api/v1/json/123/eventstv.php?d=2019-09-28&a=United_Kingdom&s=Cycling
https://www.thesportsdb.com/api/v1/json/123/eventstv.php?c=Peacock_Premium
https://www.thesportsdb.com/api/v1/json/123/eventstv.php?id=3834


seperator bar


 v1 API Video
The video API allows you to list any YouTube highlights associated with an event.
Please be aware that we have no control of YouTube and some videos may be geolocked to specific countries.
You can use various filters including date on its own or with a League ID or Sport.

Video Youtube Highlights:
Type:  Parameter: 
Type:  Parameter (optional):  {League ID}
Type:  Parameter (optional):  {Sport_Name}
Free Limit:  Premium Limit: 
Example: JSON Data
Example 2: JSON Data
Example 3: JSON Data
See the TV schedual for a particular date
https://www.thesportsdb.com/api/v1/json/123/eventshighlights.php?d=2024-07-07
https://www.thesportsdb.com/api/v1/json/123/eventshighlights.php?d=2024-07-07&l=4684
https://www.thesportsdb.com/api/v1/json/123/eventshighlights.php?d=2024-07-07&s=motorsport


seperator bar

V2 API Documentation

 v2 API Search
Search League
Type:  Limit: 
Example: Static / Live
Search for any sports league using a text string.
/api/v2/json/search/league/english_premier_league

Search Team
Type:  Limit: 
Example: Static / Live
Search for any sports team using a text string.
/api/v2/json/search/team/manchester_united

Search Player
Type:  Limit: 
Example: Static / Live
Search for any sports person using a text string.
/api/v2/json/search/player/harry_kane

Search Event
Type:  Limit: 
Example: Static / Live
Search for any sports event using a text string.
/api/v2/json/search/event/fifa_world_cup_2022-12-18_argentina_vs_france

Search Venue
Type:  Limit: 
Example: Static / Live
Search for any sports venue using a text string.
/api/v2/json/search/venue/wembley


seperator bar


 v2 API Lookup
Lookup League
Type:  Limit: 
Example: Static / Live
Lookup for any league using its unique ID {idLeague}.
/api/v2/json/lookup/league/4328

Lookup Team
Type:  Limit: 
Example: Static / Live
Lookup for any team using its unique ID {idTeam}.
/api/v2/json/lookup/team/133597

Lookup Team Equipment
Type:  Limit: 
Example: Static / Live
Lookup for any team equipment artwork using its unique ID {idTeam}.
/api/v2/json/lookup/team_equipment/133597

Lookup Player
Type:  Limit: 
Example: Static / Live
Lookup for any player using their unique ID {idPlayer}.
/api/v2/json/lookup/player/34172575

Lookup Player Contracts
Type:  Limit: 
Example: Static / Live
Lookup for any player contracts using their unique ID {idPlayer}.
/api/v2/json/lookup/player_contracts/34146304

Lookup Player Results
Type:  Limit: 
Example: Static / Live
Lookup for any player results using their unique ID {idPlayer}.
/api/v2/json/lookup/player_results/34160573

Lookup Player Honours
Type:  Limit: 
Example: Static / Live
Lookup for any player honours using their unique ID {idPlayer}.
/api/v2/json/lookup/player_honours/34146304

Lookup Player Milestones
Type:  Limit: 
Example: Static / Live
Lookup for any player milestone using their unique ID {idPlayer}.
/api/v2/json/lookup/player_milestones/34146304

Lookup Player Former Teams
Type:  Limit: 
Example: Static / Live
Lookup for any player former teams using their unique ID {idPlayer}.
/api/v2/json/lookup/player_teams/34146304

Lookup Event
Type:  Limit: 
Example: Static / Live
Lookup for any sports event using its unique ID {idLeague}.
/api/v2/json/lookup/event/441613

Lookup Event Lineup
Type:  Limit: 
Example: Static / Live
Lookup for any sports event player lineup using its unique ID {idEvent}.
/api/v2/json/lookup/event_lineup/1937584

Lookup Event Results
Type:  Limit: 
Example: Static / Live
Lookup for any sports event player results using the unique ID {idEvent}.
/api/v2/json/lookup/event_results/652890

Lookup Event Statistics
Type:  Limit: 
Example: Static / Live
Lookup for any sports event statistics using the unique ID {idEvent}.
/api/v2/json/lookup/event_stats/1937584

Lookup Event Timeline
Type:  Limit: 
Example: Static / Live
Lookup for any sports event timeline using the unique ID {idEvent}.
/api/v2/json/lookup/event_timeline/1937584

Lookup Event TV Schedule
Type:  Limit: 
Example: Static / Live
Lookup for any sports event TV schedule using the unique ID {idEvent}.
/api/v2/json/lookup/event_tv/584911

Lookup Event Youtube Highlights
Type:  Limit: 
Example: Static / Live
Lookup for any sports event YouTube highlights using the unique ID {idEvent}.
/api/v2/json/lookup/event_highlights/2044892

Lookup Venue
Type:  Limit: 
Example: Static / Live
Lookup for any sports Venue using the unique ID {idVenue}.
/api/v2/json/lookup/venue/15910


seperator bar


 v2 API List
List League Teams
Type:  Limit: 
Example: Static / Live
List all teams in a paritcular league by its unique ID {idLeague}.
/api/v2/json/list/teams/4328

List League Seasons
Type:  Limit: 
Example: Static / Live
List all seasons available for a league using its unique ID {idLeague}.
/api/v2/json/list/seasons/4328

List Team Players
Type:  Limit: 
Example: Static / Live
Lookup for all the players for a team using its unique ID {idTeam}.
/api/v2/json/list/players/133604


seperator bar


 v2 API Filter
Filter TV Events by Date
Type:  Limit: 
Example: Static / Live
Filter All TV Events on a specific date {dateEvent}.
/api/v2/json/filter/tv/day/2024-06-22

Filter TV Events by Country
Type:  Limit: 
Example: Static / Live
Filter TV Events by the channels country {strCountry}.
/api/v2/json/filter/tv/country/united_kingdom

Filter TV Events by Sport
Type:  Limit: 
Example: Static / Live
Filter upcoming TV Events by sport {strSport}.
/api/v2/json/filter/tv/sport/motorsport

Filter TV Events by Channel
Type:  Limit: 
Example: Static / Live
Filter upcoming TV Events by Channel Name {strChannel}.
/api/v2/json/filter/tv/channel/sky_sports_main_event

Filter TV Events by Channel ID
Type:  Limit: 
Example: Static / Live
Filter upcoming TV Events by Channel ID {idChannel}.
/api/v2/json/filter/tv/channelid/3834


seperator bar


 v2 API All
All Countries
Type:  Limit: 
Example: Static / Live
Show all the countries supported.
/api/v2/json/all/countries

All Sports
Type:  Limit: 
Example: Static / Live
Show all the sports supported.
/api/v2/json/all/sports

All Leagues
Type:  Limit: 
Example: Static / Live
Show all the leagues supported.
/api/v2/json/all/leagues


seperator bar


 v2 API Schedule
Next 10 Events in League
Type:  Limit: 
Example: Static / Live
List the next 5 events in a league using its unique ID {idLeague}
/api/v2/json/schedule/next/league/4328

Previous 10 Events in League
Type:  Limit: 
Example: Static / Live
List the previous 5 events in a league using its unique ID {idLeague}
/api/v2/json/schedule/previous/league/4328

Next 10 Events in Team
Type:  Limit: 
Example: Static / Live
List the next 5 events for a team using its unique ID {idTeam}
/api/v2/json/schedule/next/team/133612

Previous 10 Events in Team
Type:  Limit: 
Example: Static / Live
List the previous 5 events for a team using its unique ID {idTeam}
/api/v2/json/schedule/previous/team/133612

Next 10 Events in Venue
Type:  Limit: 
Example: Static / Live
List the next 5 events for a venue using its unique ID {idVenue}
/api/v2/json/schedule/next/venue/24413

Previous 10 Events in Venue
Type:  Limit: 
Example: Static / Live
List the previous 5 events for a venue using its unique ID {idVenue}
/api/v2/json/schedule/previous/venue/24413

Full Team Season Schedule
Type:  Limit: 
Example: Static / Live
List the full seasons schedule for a team using its unique ID {idTeam}
/api/v2/json/schedule/full/team/133612

Full League Season Schedule
Type:  Limit: 
Example: Static / Live
List the full seasons schedule for a league using its unique ID {idLeague}
/api/v2/json/schedule/league/4328/2023-2024


seperator bar


 v2 API Livescores
Livescore Sport
Type:  Limit: 
Example: Static / Live
Show the current Livescores for a particular sport {strSport}
/api/v2/json/livescore/soccer

Livescore League
Type:  Limit: 
Example: Static / Live
Show the current Livescores for a particular league by its unique ID {idLeague}
/api/v2/json/livescore/4399

Livescore All
Type:  Limit: 
Example: Static / Live
Show the current Livescores for all sports.
/api/v2/json/livescore/all

