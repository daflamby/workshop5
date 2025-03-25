import bodyParser from "body-parser";
import express from "express";
const fetch = require("node-fetch");

import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
  messages: { [key: number]: Value };
};

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let currentState: NodeState = {
    killed: false,
    x: initialValue,
    decided: null,
    k: 0,
    messages: {},
  };

  // Function to send a message to another node
  async function sendMessage(receiverId: number, value: Value) {
    try {
      await fetch(`http://localhost:${BASE_NODE_PORT + receiverId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: nodeId, value }),
      });
    } catch (error) {
      console.error(`Error sending message to node ${receiverId}:`, error);
    }
  }

  node.get("/status", (req, res) => {
    return res.status(isFaulty ? 500 : 200).send(isFaulty ? "faulty" : "live");
  });

  node.get("/getState", (req, res) => res.json(currentState));

  node.post("/message", (req, res) => {
    if (currentState.killed) return res.status(400).send("Node is stopped");

    const { senderId, value } = req.body;
    if (senderId === nodeId) return res.status(400).send("Self-message not allowed");

    currentState.messages[senderId] = value;

    if (Object.keys(currentState.messages).length >= N - F) {
      let votes = { 0: 0, 1: 0 };
      Object.values(currentState.messages).forEach(v => {
        if (v === 0) votes[0]++;
        if (v === 1) votes[1]++;
      });

      if (votes[0] >= N - F) {
        currentState.x = 0;
        currentState.decided = true;
    } else if (votes[1] >= N - F) {
        currentState.x = 1;
        currentState.decided = true;
    } else {
        currentState.x = "?";  // Retry if no clear majority
        currentState.decided = false;  // Ensure it's explicitly set to false in case of retry
    }

    }

    return res.status(200).send("Message received");
  });

  node.get("/start", async (req, res) => {
    if (currentState.killed) return res.status(400).send("Node is stopped");

    console.log(`Node ${nodeId} starting consensus.`);
    currentState.k = 1;

    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        await sendMessage(i, initialValue);
      }
    }

    return res.status(200).send("Consensus started");
  });

  node.get("/stop", async (req, res) => {
    console.log(`Node ${nodeId} stopping.`);
    currentState.killed = true;
    return res.status(200).send("Consensus stopped");
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
