export var Plan;
(function (Plan) {
    Plan["FREE"] = "FREE";
    Plan["TEAM"] = "TEAM";
    Plan["BUSINESS"] = "BUSINESS";
})(Plan || (Plan = {}));
export var AgentRole;
(function (AgentRole) {
    AgentRole["OWNER"] = "OWNER";
    AgentRole["ADMIN"] = "ADMIN";
    AgentRole["AGENT"] = "AGENT";
    AgentRole["VIEWER"] = "VIEWER";
})(AgentRole || (AgentRole = {}));
export var AgentStatus;
(function (AgentStatus) {
    AgentStatus["ONLINE"] = "ONLINE";
    AgentStatus["AWAY"] = "AWAY";
    AgentStatus["OFFLINE"] = "OFFLINE";
})(AgentStatus || (AgentStatus = {}));
export var ConversationStatus;
(function (ConversationStatus) {
    ConversationStatus["OPEN"] = "OPEN";
    ConversationStatus["ASSIGNED"] = "ASSIGNED";
    ConversationStatus["RESOLVED"] = "RESOLVED";
    ConversationStatus["ABANDONED"] = "ABANDONED";
})(ConversationStatus || (ConversationStatus = {}));
export var MessageSenderType;
(function (MessageSenderType) {
    MessageSenderType["VISITOR"] = "VISITOR";
    MessageSenderType["AGENT"] = "AGENT";
    MessageSenderType["BOT"] = "BOT";
    MessageSenderType["SYSTEM"] = "SYSTEM";
})(MessageSenderType || (MessageSenderType = {}));
//# sourceMappingURL=enums.js.map