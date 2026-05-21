import { EventData } from '@common/event-source';
import {
  KAFKA_BROKERS,
  KAFKA_CLIENT_ID,
  KAFKA_PASSWORD,
  KAFKA_SSL,
  KAFKA_USERNAME,
  NODE_ENV,
} from '@configuration/env.config';
import { Logger } from '@nestjs/common';
import { Kafka, logLevel, Producer } from 'kafkajs';

export class KafkaAdapter {
  private static readonly logger = new Logger(KafkaAdapter.name);
  private static producer: Producer;

  private static createKafka() {
    const brokers = KAFKA_BROKERS.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!brokers.length) throw new Error('KAFKA_BROKERS is not configured');

    return new Kafka({
      clientId: KAFKA_CLIENT_ID,
      brokers,
      logLevel: logLevel.INFO,
      ssl: KAFKA_SSL ? { rejectUnauthorized: false } : false,
      sasl:
        KAFKA_USERNAME && KAFKA_PASSWORD
          ? { mechanism: 'scram-sha-256', username: KAFKA_USERNAME, password: KAFKA_PASSWORD }
          : undefined,
      retry: { retries: 5, initialRetryTime: 3000, factor: 2 },
    });
  }

  private static async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.createKafka().producer({ allowAutoTopicCreation: false });
      await this.producer.connect();
    }
    return this.producer;
  }

  static async publish(eventData: EventData): Promise<void> {
    try {
      const producer = await this.getProducer();
      await producer.send({
        topic: eventData.topic,
        messages: [
          {
            key: eventData.key,
            value: JSON.stringify(eventData.transform()),
            headers: { event: eventData.event, id: eventData.id, env: NODE_ENV },
          },
        ],
      });
    } catch (error) {
      this.logger.error(`Cannot publish kafka message ${eventData.event}: ${(error as Error).message}`);
    }
  }
}
