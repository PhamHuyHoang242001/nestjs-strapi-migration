export enum EventObjectType {
  USER = 'User',
  DATA_SELF_SERVE = 'data_self_serve',
}

export interface EventObject {
  type: EventObjectType;
  id: string;
  data?: unknown;
}

export interface EventDataInput {
  id?: string;
  topic: string;
  event: string;
  key?: string;
  di_obj?: EventObject;
  pr_obj?: EventObject;
  sent_at?: Date;
}

export class EventData {
  id: string;
  topic: string;
  event: string;
  key?: string;
  di_obj?: EventObject;
  pr_obj?: EventObject;
  sent_at: Date;

  constructor(data: EventDataInput) {
    this.id = data.id;
    this.topic = data.topic;
    this.event = data.event;
    this.key = data.key;
    this.di_obj = data.di_obj;
    this.pr_obj = data.pr_obj;
    this.sent_at = data.sent_at || new Date();
  }

  transform() {
    return {
      id: this.id,
      topic: this.topic,
      event: this.event,
      key: this.key,
      di_obj: this.di_obj,
      pr_obj: this.pr_obj,
      sent_at: this.sent_at.valueOf(),
    };
  }
}
