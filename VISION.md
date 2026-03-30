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
for phase 1
we should stress that this app is a deep reflective experience for one to understand self.




=== development ==

Phase 1: we focus on the soul file creation process.
this is pretty much complete and I'm quite happy with the experience.
We should ship the first version without social feauture to the ios store to collect early feadback.
things we need before shipping:
1. i think we want to make the soul dashboard more dashboardy -- we have a spider graph
2. a web app for SEO 
3. we have a process to similate sould creation process by using cli instead of ios against the server deployemnt; the server should treat it the same as ios. dry-run-soul-files.sh --file characters.json where  characters.json list ~ 10 or so diverse characters for which we have abundant online resources to know their child experience or personality to mimic a soul. 
4. we have 7 domians that the AI should actively seek to cover. 

brainstorm items:
1. 
I suspect people want to see how they are "judged" -- currenly in the soul file we simply display a spider chart and some things we directly extracted from the user; I wonder if we should add more metrics -- INTJ or nihilism, extentialism and OTHERS (i think this justifies a research, what metrics we should use?) I think perhaps we can build a dashboard looking thing for the user. 
so i think the research item is should we show personality and values (and other apsects of soul) "judgements"; if so, how? as words or as metrics? would be nice if we can find some evidences. 


2. we currently have 7 domains; but there is nothing about sextual drives; should we add it? I think it is a critical part of the soul. but then this would be a 18+ app only and we need to be very careful about easing into this topic (perhaps have rule that we never initiate such topics)






phase 2: we focus on the social feature. 

brainstorm items:
3.
when the our understanding of the user reaches to the certain degree, we want to unable the user to socialize. 

we want to have a soulmates tab (or other names) that shows "please talk more to enable soulmate finding" or something. this way we encourage the users to use the chat mode more. once reached the threshold, we still need the user to click a button to enable the social feature while be clear that their soul files are never directly exposed to anyone else. 

perhaps it is important that users set some filters before enabling the soulmate finding feature. location and gender; and what location and gender they are looking for (perhaps other filters)

the critical thing here is 
1. how do we find them a match -- we have soul file -- it is incrediable valuable but how do we use them? 
2. how do we introduce them without leaking each other's soul file
3. should we make an effor to keep them stay on this platform? if they exchange cell number, it is perhaps bad for us but it seems inevitable; perhaps the value is in continues soul file improvement and match finding -- not after that -- or we can perhaps do something to give them a reason to use chats that are built-in this app (perhaps not the initial version but i want to have a goal or some strategy); how does tinder/hinge solve this problem?  













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



