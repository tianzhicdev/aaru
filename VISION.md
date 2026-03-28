AI is never allow to modify this file

Thumos is the field of reeds where people live happily in the virtual world

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
1. i think we want to make the soul dashboard more dashboardy; we might want to INTP estimates or something there; having some sort of graph is perhaps a good idea. 
4. do we need a website for SEO? nice to have i think, ideally this can be done cheaply using claudflare? 
5. we need to do a checklist to see what we need before lauching. and the best place to start marketing. 
6. we need to harden the soul creation process. i think what we can do is to create at least 10 sould files by using AI to pretend to be user to talk to AI. 
then we will review the soul file, and the conversation to ensure that human can review the quality. 
my idea is that we create a dry-run-soul-files.sh --file characters.json where  characters.json list ~ 10 or so diverse characters for which we have abundant online resources to know their child experience or personality to mimic a soul. 



phase 2: we focus on the social feature. 

when the our understanding of the user reaches to the certain degree, we want to unable the user to socialize. 

we want to have a soulmates tab (or other names) that shows "please talk more to enable soulmate finding" or something. this way we encourage the users to use the chat mode more. once reached the threshold, we still need the user to click a button to enable the social feature while be clear that their soul files are never directly exposed to anyone else. 

once enabled, we should try to find interesting people for them. what is the best way to do so? 
some wild thoguhts in my mid: 1. have AI reading the soul file and predending to them, talk the way they talk; through real SOUL powered conversations to find matches. 
2. just feed the soul files to AI for matching scores. perhaps good for the first version. cheap. 

the goal is taht users actually want to talk to the matched. what do we show the user? like a matchmaker -- hey this guy is a good match, here is why? it is important that we do not disclose other people's sould directly and the way we introduce others should indicate so. 








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



