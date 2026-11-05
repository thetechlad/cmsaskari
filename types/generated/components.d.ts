import type { Schema, Struct } from '@strapi/strapi';

export interface ChecklistTemplateTemplateItem extends Struct.ComponentSchema {
  collectionName: 'components_checklist_template_template_items';
  info: {
    description: 'One required/conditional evidence item in a checklist template, instantiated per-student into a checklist-item.';
    displayName: 'Template Item';
  };
  attributes: {
    code: Schema.Attribute.String & Schema.Attribute.Required;
    conditionalRoute: Schema.Attribute.String;
    evidenceHint: Schema.Attribute.Text;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    required: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'checklist-template.template-item': ChecklistTemplateTemplateItem;
    }
  }
}
