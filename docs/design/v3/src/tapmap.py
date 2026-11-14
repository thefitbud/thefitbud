"""Tap coverage: every tappable element on every mock -> destination screen / state / external / Later. Unmapped = gap."""
import json,re,collections
T=json.load(open('../_work/taps.json'));R=json.load(open('../_work/registry.json'))
IDS=sorted(R)
def F(p):
    m=[i for i in IDS if i.startswith(p)];assert m,p;return m[0]
# rules: (screen regex, class regex, text regex, dest). First match wins. dest: ID-prefix | BACK | STATE:x | EXT:x | LATER:x | INERT
RU=[
 # generic chrome
 ('.','tab','.','STATE:tab switch'),('.','key|cell|ck|toggle|rb','.','STATE:inline input'),
 ('.','navbtn|circbtn|chev','icon:chevron-left','BACK'),('.','navbtn|circbtn','icon:x|^Cancel$|^Close$','BACK'),('.','circbtn','icon:chevron-down','BACK:minimise to bar → W-14'),
 ('TM-','circbtn','icon:search',F('TM-02b')),('TR-|W-','circbtn','icon:bell',F('TR-15a')),('TM-','circbtn','icon:bell',F('TM-01a')),
 ('W-0[2-5]|W-1|W-20|W-21b','circbtn|exh','icon:$|ellipsis',F('W-09-')),('TM-03','circbtn','icon:$',F('TM-03i')),('TM-11','circbtn','icon:$',F('TM-03i')),('TM-04|TM-06','circbtn','icon:$',F('TM-04j')),
 ('TM-01b','circbtn','icon:$',F('TM-04j')),
 ('.','btn|link|navbtn','^(Cancel|Close|Back|Not now|Keep going|Keep logging|No)$','BACK'),('.','btn|navbtn|link','^Done$','BACK'),
 ('.','circbtn|chev|navbtn|li','icon:chevron-right|icon:$|^$','STATE:row chevron (parent row mapped)'),
 ('.','sumt|tmc|crow','^$','INERT:skeleton'),
 # ---------- trainee auth
 ('TR-01|TR-02|TR-24','btn|link','^Sign in$',F('TR-06a')),('.','btn','Sign in with a code instead|^Enter code$|I have a code',F('TR-01b')),('.','link','Forgot password',F('TR-01b')),
 ('.','btn','^Send code$|Send a new code|Resend code',F('TR-01c')),('.','link','Resend code',F('TR-01c')),('.','btn','Use password instead',F('TR-01a')),('.','btn','Save and sign in',F('TR-06a')),
 ('.','btn','Join Rahul',F('TR-03')),('.','link','^Sign in$',F('TR-01a')),('.','btn','Message Rahul on WhatsApp|Ask Rahul on WhatsApp','EXT:WhatsApp chat'),
 ('TR-03','btn','^Continue$|^Yes$','STATE:next intake step'),('TR-03','btn','^Continue$',F('TR-04')),
 ('TR-04','li','Reminders',F('TR-05')),('TR-04','li','Steps','EXT:iOS Health permission'),('TR-04','li','Intake form','STATE:read-only answers (same form)'),
 ('TR-05','btn','Allow notifications','EXT:iOS permission prompt → TR-06a'),('TR-05','navbtn','Skip',F('TR-06a')),('TR-05','li','Workouts|Meals|Weekly check-in|Evening summary','LATER:edit reminder times (fixed defaults in MVP)'),
 ('TR-05','li','Quiet hours|Time zone','INERT:fixed in MVP'),
 ('TR-22','btn','View past coaching','LATER:read-only past coaching history'),('TR-22','btn','Restart with Rahul',F('TR-06a')),('TR-22','btn','Keep coaching with',F('TR-06a')),
 # ---------- Today
 ('TR-06','btn','Start workout',F('W-02')),('TR-06','btn','^Start$',F('TR-14a')),('TR-06','link','^Diet$',F('TR-07a')),('TR-06','btn','Preview exercises',F('W-01a')),
 ('TR-06c','meal','Log late',F('TR-08a')),('TR-06','meal|due','Due now|Eaten as planned',F('TR-07a')),('TR-06','meal','.',F('TR-07a')),('TR-06g|TR-07i','btn','Try again','STATE:reload'),
 # ---------- Diet
 ('.','btn|pill','Eaten as planned',F('TR-07b')),('.','btn|pill','Something different',F('TR-08a')),('TR-07|TM-15','meal','Closed by Rahul','INERT:locked, explained in row'),
 ('TR-07|W-14|TM-15','meal','planned|Not logged yet|Not due',F('TR-07j')),('TR-07|W-14|TM-15','meal','.',F('TR-07g')),('TR-07|TM-15','due','.','STATE:expanded due card (buttons mapped)'),
 ('TR-07','btn','Log what I ate',F('TR-26a')),('TR-07g','btn','Edit foods',F('TR-08b')),('TR-07g','btn','Delete this log',F('TR-07h')),('TR-07h','btn','Delete log',F('TR-07a')),
 ('TR-07g','li','.','STATE:food row → edit (TR-08b)'),('TR-08a','link','Ask Rahul',F('TR-18')),
 ('TR-08b','link','Reset to plan','STATE:reset'),('TR-08b|TR-08c','navbtn','Save',F('TR-07a')),('TR-08b','btn','Save portion',F('TR-07a')),('TR-08b','li','.','STATE:stepper row'),
 ('TR-26','search','.','STATE:typing → TR-26b'),('TR-26a|TR-26b','li','.',F('TR-26c')),('TR-26b','chip','.','STATE:remove from tray'),('TR-26b','btn|navbtn','Save',F('TR-26f')),
 ('TR-26c','chip','.','STATE:unit/amount'),('TR-26c','navbtn|btn','^Add|Add to',F('TR-26b')),('TR-26c','navbtn','Results','BACK'),('TR-26c','li','Meal','LATER:meal picker'),
 ('TR-26d','btn','Log as Ate out',F('TR-08c')),('TR-26d','btn','^Create',F('TR-26e')),
 # ---------- Workout
 ('W-01|TR-10','btn','Start workout',F('W-02')),('W-01','btn','Continue workout',F('W-03')),('W-01','btn','Finish now',F('W-16')),('W-01','btn','View summary',F('W-17b')),('W-01|TR-10','btn','Log it',F('W-02')),
 ('TR-10b','btn','Message Rahul','EXT:WhatsApp chat'),('W-01','li|crow','.','STATE:next session preview (date in strip)'),
 ('W-','addset','.','STATE:new set row'),('W-','wchip','Note',F('W-10')),('W-','wchip','.','INERT:coach target / rest (plan value)'),
 ('W-|TM-15','exh|ex','.',F('W-27')),('W-03b','btn','Add exercise',F('W-21a')),('W-','btn','Discard workout|^Discard$',F('W-15')),('W-15','btn','Discard workout',F('W-01a')),
 ('W-','btn','^Finish$',F('W-16')),('W-16','btn','Finish anyway',F('W-17a')),('W-16','li|link','.',F('W-03-')),
 ('W-09-','li','How to',F('W-27')),('W-09-','li','History',F('W-26')),('W-09-','li','Replace',F('W-22')),('W-09-','li','Ask Rahul',F('TR-18')),('W-09-','li','Skip exercise|Remove',F('W-09b')),
 ('W-13','btn','Save changes|Mark not done|Delete set',F('W-03-')),('W-17a','btn','Save and share',F('W-17b')),('W-17a','li','.','INERT:change summary'),('W-17b','btn','Done',F('W-01c')),
 ('W-18','btn','Resume workout',F('W-03-')),('W-18','btn','Finish and save',F('W-17a')),('W-19','btn|link|pill','Resume','STATE:resume'),('W-14','minibar|pill','.',F('W-03-')),
 ('W-21a','li','.','STATE:select'),('W-21a','navbtn','Add',F('W-21b')),('W-21a','search','.','STATE:typing'),('W-22','li','.','STATE:select'),('W-22','btn','Replace for today',F('W-03-')),('W-22','link','Search all',F('W-21a')),
 ('W-26|W-27','.','.','STATE:segmented tab'),('W-10','navbtn','Save',F('W-03-')),('W-04','link','Done','BACK'),
 # ---------- Check-in / progress
 ('TR-14a','btn','Next',F('TR-14b')),('TR-14b','btn','Next|Skip photos',F('TR-14c')),('TR-14c','btn','Send to Rahul',F('TR-14d')),('TR-14c','li','.',F('TR-14a')),('TR-14d|TR-14e','btn','Done',F('TR-06a')),
 ('TR-14f','btn','Start check-in',F('TR-14a')),('TR-14g','li','.','INERT:read only'),
 ('TR-13','btn','Log weight',F('TR-13c')),('TR-13c','btn','Save weight',F('TR-13a')),('TR-13c','li','Date','LATER:backdate weight'),('TR-13','li','Check-ins',F('TR-13d')),('TR-13','li','photos',F('TR-13e')),
 ('TR-13d','li','Week 3',F('TR-14a')),('TR-13d','li','.',F('TR-14g')),
 # ---------- notifications / more / system
 ('TR-15a','navbtn','Read all','STATE:mark read'),('TR-15a','li','nudged','STATE:deep link → nudged item (TR-07a / W-01a)'),('TR-15a','li','replied|Check-in reviewed',F('TR-14g')),('TR-15a','li','Workout today',F('W-01a')),
 ('TR-15a','li','snack is due',F('TR-07a')),('TR-15a','li','changed your plan',F('W-01d')),('TR-15a','li','personal record',F('W-26')),
 ('TR-20a|TR-18|TR-19|TR-20f','li','Reminders',F('TR-16a')),('TR-20a|TR-18|TR-19|TR-20f','li','^Steps',F('TR-25')),('TR-20a|TR-18|TR-19|TR-20f','li','Account',F('TR-20c')),('TR-20a|TR-18|TR-19|TR-20f','li','Help',F('TR-20e')),
 ('TR-20a|TR-18|TR-19|TR-20f','li','Sign out',F('TR-20f')),('TR-20a|TR-18|TR-19','btn','WhatsApp','EXT:WhatsApp chat'),
 ('TR-20c','li','Password',F('TR-20g')),('TR-20c','li','Mobile|Email','LATER:change sign-in number/email (ask coach)'),('TR-20c','li','Delete account',F('TR-20d')),('TR-20c','li','Download','STATE:toast'),
 ('TR-20d','btn','Delete account',F('TR-01a')),('TR-20b','navbtn','Save','BACK'),('TR-20g','navbtn','Save','BACK'),('TR-20e','li','Email','EXT:mailto'),('TR-20e','li','Message Rahul','EXT:WhatsApp chat'),
 ('TR-20f','btn','Send first',F('TR-19a')),('TR-20f','btn','Sign out anyway',F('TR-01a')),('TR-16','li','.','STATE:toggle'),('TR-16b','link','Open Settings','EXT:iOS Settings'),('TR-25','li','.','STATE:toggle'),
 ('TR-19a','btn','Try sending','STATE:sending'),('TR-19a','li','.','INERT:status row'),('TR-19b','btn','Keep my log','BACK'),('TR-19b','btn','See Rahul',F('TR-07a')),('TR-18','btn','Open in WhatsApp','EXT:WhatsApp with prefill'),
 ('TR-21','btn','Try again','STATE:reload'),('TR-21','btn','Go to Today',F('TR-06a')),('TR-23','btn','.',F('W-01a')),
 # ---------- trainer
 ('TM-01','sumt','.','STATE:scroll to group'),('TM-01','tmc','Rohan|Neha',F('TM-04a')),('TM-01','tmc','Aarav|Ishita',F('TM-10a')),('TM-01','tmc','Sneha|Deepak',F('TM-06a')),('TM-01','tmc','Priya',F('TM-04l')),('TM-01','tmc','Meera',F('TM-04e')),
 ('TM-01','crow','Aarav',F('TM-11a')),('TM-01','crow','Deepak',F('TM-03c')),('TM-01','btn','^Review$',F('TM-04a')),('TM-01','btn','^Reply$',F('TM-10a')),('TM-01g','btn','Try again','STATE:reload'),
 ('TM-04|TM-03|TM-06d|TM-05','btn','^Nudge',F('TM-04b')),('TM-03','btn','Nudge…',F('TM-03j')),('TM-04[b-o]|TM-03j','chip','.','STATE:template'),('TM-04b|TM-04c|TM-04o','btn','Send nudge',F('TM-04m')),('TM-04n','btn','Send nudge','INERT:disabled (limit)'),
 ('TM-04','btn','Mark reviewed',F('TM-01c')),('TM-04[a-o]','btn','^Resolve$',F('TM-04d')),('TM-04d','btn','^Resolve$',F('TM-04f')),('TM-04d','chip','.','STATE:outcome'),
 ('TM-04j|TM-03i','li','Add note',F('TM-04k')),('TM-04j|TM-03i','li','WhatsApp','EXT:WhatsApp chat'),('TM-04j','li','profile',F('TM-03a')),('TM-03i','li','Goal',F('TM-03f')),('TM-03i','li','Log in person',F('TM-15a')),('TM-03i','li','web','EXT:copy web link'),
 ('TM-04k','navbtn','Save','STATE:toast saved'),('TM-04k','li','.','STATE:toggle'),('TM-04g','btn','.',F('TM-01a')),('TM-04l','btn','Open Friday',F('TM-12a')),
 ('TM-10a','btn','Mark answered',F('TM-10b')),('.','btn','Reply on WhatsApp|^WhatsApp$','EXT:WhatsApp chat'),('TM-03j','btn','Next',F('TM-04b')),
 ('TM-02','chip','.','STATE:filter'),('TM-02','search','.','STATE:typing'),('TM-02|TM-13b','crow','Anita','LATER:invite management on web'),('TM-02|TM-13b','crow','Kavya|Nikhil',F('TM-03d')),('TM-02|TM-13b','crow','Deepak',F('TM-03c')),
 ('TM-02|TM-13b','crow','Vikram',F('TM-03g')),('TM-02|TM-13b','crow','.',F('TM-03a')),('TM-02e','btn','Copy web link','STATE:toast copied'),('TM-02','sumt','.','STATE:filter'),
 ('TM-09','chip','Farhan',F('TM-09d')),('TM-09','chip','.','STATE:filter'),('TM-09','crow','finished',F('TM-11a')),('TM-09','crow','logged',F('TM-09b')),('TM-09','crow','check-in',F('TM-06a')),('TM-09','crow','.',F('TM-03a')),
 ('TM-09b','btn','Open Aarav',F('TM-03a')),('TM-09b|TM-11|TM-12b','btn','Add note',F('TM-04k')),('TM-09c','btn','Clear filters',F('TM-09a')),('TM-09d','navbtn|search','.','STATE:filter'),('TM-09d','crow','.','STATE:select'),
 ('TM-03','btn','^Note$',F('TM-04k')),('TM-03','btn','^Review$',F('TM-04a')),('TM-03','btn','Review check-in',F('TM-06a')),('TM-03','link','Review day',F('TM-12a')),('TM-03','link','See all',F('TM-09a')),
 ('TM-03','link','Add note',F('TM-04k')),('TM-03','link','Goal, intake',F('TM-03f')),('TM-03','btn','Copy link','STATE:toast copied'),('TM-03d','link','Reactivate',F('TM-03e')),('TM-03e','btn','Send invite',F('TM-03d')),
 ('TM-03f','li','Intake answers','LATER:intake answers on web (TW-10)'),('TM-03f','li','.','INERT:read only'),('TM-03g','btn','Remind on WhatsApp','EXT:WhatsApp with prefill'),('TM-03h','btn','.','STATE:reload'),
 ('TM-03e','li','.','INERT:info'),('TM-12','crow','Lunch|Dinner|Breakfast|Early|Evening',F('TM-12b')),('TM-12','navbtn','.','STATE:prev/next day'),
 ('TM-05','crow','.',F('TM-06a')),('TM-05','.','To review|Overdue|Reviewed','STATE:segment'),('TM-06a|TM-06e','btn','^Reply$',F('TM-06b')),('TM-06','btn','Mark reviewed',F('TM-06c')),('TM-06b','navbtn','Send',F('TM-06c')),('TM-06b','li','.','STATE:toggle'),
 ('TM-06d','li','Last check-in',F('TM-06g')),('TM-06f','chip','.','STATE:angle'),
 ('TM-07|TM-08c','li','Notifications',F('TM-07b')),('TM-07|TM-08c','li','web','EXT:copy web link'),('TM-07|TM-08c','li','Switch to client',F('TM-08c')),('TM-07|TM-08c','li','Help',F('TM-07e')),('TM-07|TM-08c','li','Sign out',F('TM-07f')),
 ('TM-07b|TM-07c','li','.','STATE:toggle'),('TM-07c','link','Open Settings','EXT:iOS Settings'),('TM-07d','navbtn','Save','BACK'),('TM-07d','btn','Change password',F('TR-20g')),('TM-07e','li','.','EXT:mailto'),('TM-07f','btn','Sign out',F('TR-01a')),
 ('TM-08a','rolec','.','STATE:select'),('TM-08a','btn','Continue as coach',F('TM-01a')),('TM-08b','btn','Email support','EXT:mailto'),('TM-08b','btn','Sign out',F('TR-01a')),('TM-08c','rolec','.','STATE:select'),('TM-08c','btn','Switch to client',F('TR-06a')),
 ('TM-08d','li','Switch to coach',F('TM-01a')),('TM-08d','li','Reminders',F('TR-16a')),('TM-08d','li','^Steps',F('TR-25')),('TM-08d','li','Account',F('TR-20c')),('TM-08d','li','Help',F('TR-20e')),
 ('TM-15','btn','Something different',F('TR-08a')),('TM-15','.','.','STATE:reuses trainee editor'),
 ('TM-01|TM-07a|TM-07g|TM-07f|TM-07e|TM-08c','crow|li','Rahul|Karan',F('TM-07d')),
]
RU[0:0]=[('TM-03','btn','Nudge…',F('TM-03j')),('TM-04d','btn','^Resolve$',F('TM-04f')),('W-','pill','Finish',F('W-16')),('TR-20a|TR-18|TR-19|TR-20f','chev','.',F('TR-20b')),('TM-07|TM-08c','chev','.',F('TM-07d')),('TR-06c','pill','Log late',F('TR-08a')),('TR-04','circbtn','circle-user',F('TR-20c')),('TR-07j','li','.','INERT:planned food'),('TR-08a','meal|due','.','INERT:behind sheet scrim'),('W-18','btn','Continue workout','INERT:behind dialog scrim'),
 ('.','circbtn','message-circle','EXT:WhatsApp chat'),('TR-22a','link','Enter code',F('TR-01c')),('TR-26a|TR-26d','navbtn','Save','INERT:disabled'),('W-14','circbtn','chevron-up',F('W-03-')),
 ('TM-01e','tmc','.','INERT:skeleton'),('TM-03j','li','.','STATE:select'),('TM-06c','crow','.',F('TM-06a')),('TM-13b','chip','.','STATE:filter')]
# W12 additions (14 Nov): custom food, saved confirmation, future days view only, Live Activity
RU[0:0]=[('TR-26e','navbtn|btn','^Add',F('TR-26f')),('TR-26e','li','Save to my foods','STATE:toggle'),('TR-26f','meal','Evening snack',F('TR-07g')),('TR-26f','meal','planned',F('TR-07j')),('TR-26f','meal','.',F('TR-07g')),
 ('TR-07k','meal','.','STATE:planned meal detail, read only (future day: no log actions)'),
 ('TR-15d','pill','^Log','STATE:logs the set from the lock screen; tile advances to the next set'),('TR-15d','pill','^Open$',F('W-03-'))]
# profile cards on More (trainee)
RU.insert(0,('TR-20a|TR-18|TR-19|TR-20f','.','Aarav Sharma',F('TR-20b')))
RU.insert(0,('TM-07','.','^RV Rahul Verma|Coach · 10',F('TM-07d')))
out=collections.OrderedDict();unm=[];cnt=collections.Counter()
for sid,taps in T.items():
    rows=[]
    for k,t in taps:
        d=None
        for sp,cp,tp,dest in RU:
            if re.search(sp,sid) and re.search(cp,k) and re.search(tp,t): d=dest;break
        if d is None: d='GAP';unm.append((sid,k,t))
        rows.append((k,t,d));cnt[d.split(':')[0] if ':' in d or d in('BACK','GAP') else 'SCREEN']+=1
    out[sid]=rows
json.dump(out,open('../_work/tapmap.json','w'),indent=0)
print(cnt);print(len(unm))
for u in unm: print(*u,sep=' | ')
