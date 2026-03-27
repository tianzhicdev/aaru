AI is never allow to modify this file

AARU is the field of reeds where people live happily in the virtual world

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
we should try to keep the tech stack simple, the architecture simple while at the same time optimizing the user experience.


Phase 1: we focus on the soul file creation process.
this is the current focus.

phase 2: we focus on the social feature. 
do not make dedicated effort here yet. it is good if we keep in mind that this feature will be developed.  


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



