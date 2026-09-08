/** Shared, scoped review typography; never inherit the manuscript's display styles. */
export const REVIEW_SIDEBAR_CSS = `
.video-desk.video-desk,.text-desk.text-desk{font:14px/1.6 "PingFang SC","Microsoft YaHei",sans-serif}
.video-desk h2,.text-desk h2{font:600 20px/1.4 "PingFang SC",sans-serif}
.video-desk h3,.text-desk h3{font:600 15px/1.5 "PingFang SC",sans-serif;margin:20px 0 10px}
.video-desk button,.text-desk button{background:#fff;color:#31433f;border:1px solid #cbd4cf;border-radius:7px;font:500 13px/1.4 "PingFang SC",sans-serif;padding:7px 10px;max-width:100%;white-space:normal;text-align:left}
.video-desk button:hover,.text-desk button:hover{background:#eaf0ec;border-color:#718c7e}
.video-desk :focus-visible,.text-desk :focus-visible{outline:2px solid #37745e;outline-offset:3px}
.video-desk select,.text-desk select{max-width:100%;min-width:0;background:#fff;color:#303c36;border:1px solid #cbd4cf;border-radius:7px}
.video-comments,.text-comments{min-width:0;background:#f2f3ee;border:1px solid #e0e3da;border-radius:10px;padding:16px!important;overflow:auto}
.video-comments textarea,.text-comments textarea{font:14px/1.7 "PingFang SC",sans-serif;padding:12px;border:1px solid #cbd4cf;border-radius:8px;background:#fff;color:#242e29;resize:vertical}
.video-note.video-note,.text-note.text-note{background:#fff;border:1px solid #dce1d8;border-radius:9px;padding:14px;margin:10px 0 14px;overflow-wrap:anywhere}
.video-note>strong,.text-note>strong{display:table;font-size:12px;line-height:1.6;color:#47624e;background:#edf2e9;border-radius:4px;padding:3px 7px;margin-bottom:10px}
.video-note p,.text-note p{font-size:14px;line-height:1.8;margin:10px 0}
.video-note small,.text-note small{display:block;color:#68746c;font-size:12px;line-height:1.7;margin:8px 0}
.video-note button,.text-note button{margin:4px 5px 4px 0;font-size:12px}
.video-note p~p,.text-note blockquote{background:#f4f6f1;border-left:3px solid #b6c7b8;padding:9px 11px;color:#46534a}
.text-note details{font-size:12px;color:#647066;margin-top:10px}
.video-selection{font-size:12px;font-variant-numeric:tabular-nums;line-height:1.8}
.video-layout,.text-layout{grid-template-columns:minmax(0,1fr) minmax(320px,390px);min-height:0;flex:1}
.video-layout{overflow:hidden}.video-view{overflow:auto}.video-timeline{accent-color:#35634f;min-height:24px;cursor:pointer}
.video-clock{font-size:13px;color:#536259;font-variant-numeric:tabular-nums;margin-bottom:12px}
@media(max-width:800px){.video-layout,.text-layout{grid-template-columns:minmax(0,1fr);overflow:auto}.video-comments,.text-comments,.video-view{overflow:visible}}
`;
