// Groups for the opening-count checklist, guessed from item names.
// First matching group wins, so the more specific groups come first.
const RULES: [string, RegExp][] = [
  ['Safety & first aid', /helmet|boots|gloves?\b|jacket|mask|goggle|harness|safety|ear (muff|plug)|overall|dust coat|rain coat|sign(age)?\b|banner|sticker|traffic cone|first aid|bandage|extinguisher|fire |gauze|sanitizer|antiseptic|dressing|stretcher|whistle|caution tape|warning tape|iodine|eye (pad|drop)|resuscitation|thermal blanket|spirit 500|log ?book|permit book|visitors|accident/i],
  ['Cement & aggregates', /\bcement\b|ballast|sand\b|quarry|dust\b|hardcore|murram|premix|ready mix|red soil|lime\b|whitewash/i],
  ['Blocks & stones', /block|machine cut stone|kerb|paving|culvert|road channel|coping|stones/i],
  ['Steel & metal', /\bt\d+ bars|\bbars?\b|brc|binding wire|hoop iron|weld ?mesh|round bar|\brhs\b|\bshs\b|\bchs\b|angle|flat bar|plate|purlin|mild steel|black sheet|iron sheet|roofing sheet|flashing|chain link|expanded metal|wire rope|z mild|steel tube|ms /i],
  ['Timber & boards', /timber|plywood|board|gum pole|cypress|mahogany|skirting|caraz|rioverde|laminated|styrofoam|door frame|flush door|wardrobe|kitchen cabinet/i],
  ['Plumbing & water', /\bppr\b|\bpvc\b|\bgi\b|valve|tap\b|bip tap|pipe|bend|elbow|trap|toilet|basin|sink|cistern|w\/?c|shower|tank|manhole|urinal|float switch|flexible|hose|water meter|boss (connector|con)|nipple|union|fulbora|gully|shattaf|mixer|stop cork|ball co(ck|rk)|thread seal|ptfe|hemp|boss white|tank connector|magic connector|saddle|rubber (bracket|clip)|vent c/i],
  ['Electrical', /cable|switch|socket|conduit|\bmcb|mccb|isolator|breaker|light|lamp|led\b|flood|consumer unit|distribution board|earth|lug|trunking|patress|boxes|cutout|outlet|draw wire|coupler|\bpole\b|cooker|insulat|cctv|bulkhead|fitting|pendant|spotlight|gland|cable ti|clips|receptacle|timer|avs|conductor|copper tape|lamb|tube light/i],
  ['Paint & finishes', /paint|tile|grout|adhesive|gypsum|gyprock|filler|varnish|thinner|turpentine|primer|undercoat|waterproof|emulsion|glass|mirror|alumin|polycarbonate|sand ?paper|silicon|spacer|super gloss|white spirit|dr\.? fixit|mapelastic|sika|planiseal|pidi|latex|body filler|edg(e|ing)|lipping|edge bind/i],
  ['Fixings & hardware', /nail|screw|bolt|anchor|rivet|hinge|lock|handle|padlock|wall plug|glue|tape|tie rod|washer|bush|bracket|runner|stopper|hook|tower bolt|pad bolt|latch|drawer|knob|rail|holder|shelf|leg -|door stop|lid stay|j bolt|u clip|threaded rod|scaffold|universal jack|clamp|cross brace|h-frame|dispenser|swing bin|bin\b/i],
  ['Tools & equipment', /machine|drill|grinder|disc|disk|\bbit\b|bit |hammer|spade|shovel|wheelbarrow|trowel|level|saw|blade|chisel|measur|pliers|wrench|mattock|rake|axe|machete|vibrator|poker|pump|welding|rammer|hoist|vice|crawbar|craw bar|cutter|gun|instrument|station|laser|weighing|brush|roller|broom|mop|bucket|drum|ladder|rope|chalk|try square|steel tape|carburat|armature|starter|bearing|piston|pitson|cube mould|tamping|f clamp|head lamp|torch|radio|umbrella|pressure|heat gun|blower|auger|sledge|carbon brush|engine/i],
];

export function categoryOf(name: string): string {
  for (const [label, re] of RULES) if (re.test(name)) return label;
  return 'Other';
}

export const CATEGORY_ORDER = [...RULES.map((r) => r[0]), 'Other'];
