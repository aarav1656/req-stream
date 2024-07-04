"use client"
import React, { useEffect, useState } from "react";
import {
  RequestNetwork,
  Types,
  Utils,
} from "@requestnetwork/request-client.js";
import { EthereumPrivateKeySignatureProvider } from "@requestnetwork/epk-signature";
import {
  approveErc20,
  hasSufficientFunds,
  hasErc20Approval,
  payRequest,
} from "@requestnetwork/payment-processor";
import { providers, Wallet } from "ethers";
import { config } from "dotenv";

config();

const RequestPaymentComponent: React.FC = () => {
  const [requestData, setRequestData] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("Initializing...");

  useEffect(() => {
    const initiatePayment = async () => {
      try {
        const epkSignatureProvider = new EthereumPrivateKeySignatureProvider({
          method: Types.Signature.METHOD.ECDSA,
          privateKey: process.env.REACT_APP_PAYEE_PRIVATE_KEY as string, // Must include 0x prefix
        });

        const requestClient = new RequestNetwork({
          nodeConnectionConfig: {
            baseURL: "https://sepolia.gateway.request.network/",
          },
          signatureProvider: epkSignatureProvider,
        });

        const payeeIdentity = new Wallet(process.env.REACT_APP_PAYEE_PRIVATE_KEY as string).address;
        const payerIdentity = payeeIdentity;
        const paymentRecipient = payeeIdentity;
        const feeRecipient = "0x0000000000000000000000000000000000000000";

        // Define the first request in a series
        const expectedFlowRate = 1000000; // Example flow rate
        const expectedStartDate = Utils.getCurrentTimestampInSecond(); // Example start date

        const requestCreateParameters: Types.IRequestParameters = {
          requestInfo: {
            currency: {
              type: Types.RequestLogic.CURRENCY.ERC20,
              value: "0x370DE27fdb7D1Ff1e1BaA7D11c5820a324Cf623C",
              network: "sepolia",
            },
            expectedAmount: "1000000000000000000",
            payee: {
              type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
              value: payeeIdentity,
            },
            payer: {
              type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
              value: payerIdentity,
            },
            timestamp: Utils.getCurrentTimestampInSecond(),
          },
          paymentNetwork: {
            id: Types.Extension.PAYMENT_NETWORK_ID.ERC777_STREAM,
            parameters: {
              expectedFlowRate,
              expectedStartDate,
              paymentAddress: paymentRecipient,
            },
          },
          contentData: {
            reason: "🍕",
            dueDate: "2023.06.16",
          },
          signer: {
            type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
            value: payeeIdentity,
          },
        };

        const request = await requestClient.createRequest(requestCreateParameters);
        let requestData = await request.waitForConfirmation();
        setRequestData(requestData);
        setPaymentStatus("Request created.");

        const provider = new providers.JsonRpcProvider(process.env.REACT_APP_JSON_RPC_PROVIDER_URL as string);
        const payerWallet = new Wallet(process.env.REACT_APP_PAYER_PRIVATE_KEY as string, provider);

        const _hasSufficientFunds = await hasSufficientFunds(requestData, payerWallet.address, { provider });
        if (!_hasSufficientFunds) {
          throw new Error(`Insufficient Funds: ${payerWallet.address}`);
        }

        const _hasErc20Approval = await hasErc20Approval(requestData, payerWallet.address, provider);
        if (!_hasErc20Approval) {
          const approvalTx = await approveErc20(requestData, payerWallet);
          await approvalTx.wait(2);
        }

        const paymentTx = await payRequest(requestData, payerWallet);
        await paymentTx.wait(2);
        setPaymentStatus(`Payment complete. ${paymentTx.hash}`);

        let startTime = Date.now();
        while (requestData.balance?.balance < requestData.expectedAmount) {
          requestData = await request.refresh();
          setBalance(requestData.balance?.balance);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (Date.now() - startTime >= 5000) {
            break;
          }
        }
      } catch (err) {
        setError(err.message);
      }
    };

    initiatePayment();
  }, []);

  return (
    <div>
      <h1>Request Payment Component</h1>
      {error && <p>Error: {error}</p>}
      <p>Payment Status: {paymentStatus}</p>
      <p>Request Data: {requestData ? JSON.stringify(requestData) : "Loading..."}</p>
      <p>Current Balance: {balance !== null ? balance : "Loading..."}</p>
    </div>
  );
};

export default RequestPaymentComponent;
