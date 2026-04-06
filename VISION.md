AI is never allow to modify this file

Thumos is a virtual world where people create a soul file by talking with AI. It has a social feature where we help them to find soulmates.

This App has 2 main parts 

1. the soul file builder -- users are invited to have a reflective conversation with AI 
this build a soul file

2. the soul file is used by an AI agent to converse with other soul loaded AI agents. 


Rationale

soul file creation gets the users in the door. the social feature keeps them staying.  

Principle:

The soul file creation process is critical. it should induce a deep reflective conversation between the user and AI. The user should felt understood and the soul file should be accurate. the overall creation process should feel herapeutic and trust worthy.

the social feature requires further design and discussion. the goal is to remove the friction of human social interactions. Let AI agents do the cold openning and the initial conversations. The sould file should be made clear that it is 100% private to the user. The agents can read the owner soul file but never directly share with others. The soul file should be structured in a way that 1. the visible part of the soul file should read accurate and loving to the user. 2. the hidden part of the soul file (together with the visible part) should guide agent to better find a matching soul. 

Engineering note:
simplicity:
we should try to keep the tech stack simple, the architecture simple while at the same time optimizing the user experience.


debug functions:
we should be able to have a debug build that is only available to developer where the developers can see things like what model is used, hidden soul file and inpersonate (overwide device id) 


=== marketing ===
trythumos.com for SEO
social networks for initial feedback




=== development ==

Phase 1: we focus on the soul file creation process.
we have a reflective note (or memory) to facilitate conversation 
then we create a soul file.
we shall cover multiple domains about the user throughout the conversation 
(optional) we shall leverage xai to inject real time news into the conversation to keep things interesting.  


phase 2: we focus on the social feature. 
when the our understanding of the user reaches to the certain degree, we want to unable the user to socialize. 

we want to have a soulmates tab (or other names) that shows "please talk more to enable soulmate finding" or something. this way we encourage the users to use the chat mode more. once reached the threshold, we still need the user to click a button to enable the social feature while be clear that their soul files are never directly exposed to anyone else. 

perhaps it is important that users set some filters before enabling the soulmate finding feature.
user fills out name, gender, age, location; and what gender and age they are looking for (perhaps other filters) 

once filled out the basic infd and preferences; they click "find soulmate"; the soulmate tab becomes a list of matches -- like an IM chat.

step 1. 
1. each row is a matched person show name, a little detail icon (when clicked we show a popup window on why it is a match) and a chat icon -- this will be the chat window for the 2 users. 
2.  evaluateMatch at this stage is simple, it takes 2 soul file and generate a matching result. 


step 2. 
1. notification 
2. evaluateMatch generate matching result based on simulated conversations. 





















On Development

This VISION.md file is the bible of the project, only human can modify. 
we should create a develop-vision.sh that 
while true, do:
    1. reads this file, examine the codebase and propose the biggest impactful change it can make in one setting to move the code base toward the vision. 
    2. write a detailed implementation-plan.<timestamp>.md for the proposed change
    3. execute implementation-plan.<timestamp>.md to make code changes  
    4. create or update CLAUDE.md (for HOWTOs and etc), ARCHITECTURE.md (for detailed technical design) and VERIFICATION.md (instruct the code agent on how to verify the build/deployment) to reflect the updated technical reality. (first time there would be a lot of work to create the inital files)
    5. execute VERIFICATION.md to ensure that the build and deployment is perfect, fix issues and repeat.

the goal is for me to run  develop-vision.sh  and go to be only to wake up to a updated codebase that is closer to the goal.  
each step we should invoke claude code. 

On Implementation

1. we use device it to identify user id. everything else is connected to user id. 
2. for the server code, all model profiles share the same interface using wrappers. it is easy to add new model profiles or backend llm apis using the same interface. 
3. for conversations between thumos and users, we use streaming from LLM api and SSE to the ios device with no reponse_format. 
4. for reflective note and soul files we force response schema
5. we have a queue for reflective note, hidden soul file and visible soul file. 
6. reflective note, hidden soul file and visible soul file are all versioned but only the latest ones can be used.





