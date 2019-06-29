/*
 node-jvm
 Copyright (c) 2013 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/

var util = require("util"),
    Reader = require("../util/reader.js"),
    TAGS = require("./tags.js"),
    ACCESS_FLAGS = require("./accessflags.js"),
    ATTRIBUTE_TYPES = require("./attributetypes.js");


var ClassArea = module.exports = function (classBytes) {
    if (this instanceof ClassArea) {
        this.classImage = getClassImage(classBytes);
    } else {
        return new ClassArea(classBytes);
    }
}

ClassArea.prototype.getClassName = function () {
    return this.classImage.constant_pool[this.classImage.constant_pool[this.classImage.this_class].name_index].bytes;
}

ClassArea.prototype.getSuperClassName = function () {
    return this.classImage.constant_pool[this.classImage.constant_pool[this.classImage.super_class].name_index].bytes;
}

ClassArea.prototype.getAccessFlags = function () {
    return this.classImage.access_flags;
}

ClassArea.prototype.getConstantPool = function () {
    return this.classImage.constant_pool;
}

ClassArea.prototype.getFields = function () {
    return this.classImage.fields;
}

ClassArea.prototype.getMethods = function () {
    return this.classImage.methods;
}

ClassArea.prototype.getClasses = function () {
    var self = this;
    var classes = [];
    this.classImage.attributes.forEach(function (a) {
        if (a.info.type === ATTRIBUTE_TYPES.InnerClasses) {
            a.info.classes.forEach(function (c) {
                try {
                    if (c.inner_class_info_index > 0) {
                        classes.push(self.classImage.constant_pool[self.classImage.constant_pool[c.inner_class_info_index].name_index].bytes);
                    }
                    if(c.outer_class_info_index > 0) {
                        classes.push(self.classImage.constant_pool[self.classImage.constant_pool[c.outer_class_info_index].name_index].bytes);
                    }
                } catch (ex) {
                    console.error(ex);
                }
            });
        }
    });
    return classes;
}

function decodeDescriptorType(descriptor) {
    let signature = '';
    switch (descriptor[0]) {
        case 'B':
            signature = 'byte';
            break;
        case 'C':
            signature = 'char';
            break;
        case 'D':
            signature = 'double';
            break;
        case 'F':
            signature = 'float';
            break;
        case 'I':
            signature = 'int';
            break;
        case 'J':
            signature = 'long';
            break;
        case 'L':
            signature = 'class';
            break;
        case 'S':
            signature = 'short';
            break;
        case 'V':
            signature = 'void';
            break;
        case 'Z':
            signature = 'boolean';
            break;
        case '[':
            signature = 'array';
            break;
        default:
            throw new Error(`Unknown type [${descriptor[0]} in ${descriptor}]`);
    }

    return signature;
}

function decodeAccessFlags(access_flags) {
    let result = '';

    if (access_flags & ACCESS_FLAGS.ACC_PUBLIC) {
        result += 'public ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_PRIVATE) {
        result += 'private ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_PROTECTED) {
        result += 'protected ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_STATIC) {
        result += 'static ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_FINAL) {
        result += 'final ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_SYNCHRONIZED) {
        result += 'synchronized ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_VOLATILE) {
        result += 'volatile ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_TRANSIENT) {
        result += 'transient ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_NATIVE) {
        result += 'native ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_INTERFACE) {
        result += 'interface ';
    }
    if (access_flags & ACCESS_FLAGS.ACC_ABSTRACT) {
        result += 'abstract ';
    }

    return result;
}

function decodeSignatureComponent(descriptor, pos) {
    let result = '';
    switch (descriptor[pos.currentPos]) {
        case 'B':
            result = 'byte';
            break;
        case 'C':
            result = 'char';
            break;
        case 'D':
            result = 'double';
            break;
        case 'F':
            result = 'float';
            break;
        case 'I':
            result = 'int';
            break;
        case 'J':
            result = 'long';
            break;
        case 'L':
            let endPos = descriptor.indexOf(';', pos.currentPos);
            endPos = endPos == -1 ? descriptor.length : endPos;
            result = descriptor.substring(pos.currentPos + 1, endPos).replace(/\//g,'.');
            pos.newPos = endPos;
            break;
        case 'S':
            result = 'short';
            break;
        case 'V':
            result = 'void';
            break;
        case 'Z':
            result = 'boolean';
            break;
        case '[':
            pos.currentPos++;
            result = `${decodeSignatureComponent(descriptor, pos)}[]`;
            break;
        default:
            throw new Error(`Unknown type [${descriptor[0]} in ${descriptor}]`);
    }
    return result;
}

function decodeSignature(descriptor) {
    let result = {returnType: null, parameterTypes: null};
    let returnType = [];
    let parameterTypes = [];
    let resultArray = returnType;
    let inParametersFlag = false;

    for (let pos = 0; pos < descriptor.length; pos++) {
        switch (descriptor[pos]) {
            case '(':
                resultArray = parameterTypes;
                break;
            case ')':
                resultArray = returnType;
                break;
            default:
                let posStruct = {currentPos: pos, newPos: -1};
                resultArray.push(decodeSignatureComponent(descriptor, posStruct))
                if (posStruct.newPos > -1) {
                    pos = posStruct.newPos;
                }
        }
    }

    result.returnType = resultArray[0];
    if (parameterTypes.length > 0) {
        result.parameterTypes = parameterTypes;
    }

    return result;
}

function createFieldSignature(name, descriptor, access_type) {
    return `${decodeAccessFlags(access_type)}${decodeSignatureComponent(descriptor, {currentPos: 0, newPos: 0})} ${name};`;
}

function createMethodSignature(name, descriptor, access_type) {
    let signatureParts = decodeSignature(descriptor);
    return `${decodeAccessFlags(access_type)}${signatureParts.returnType} ${name}(${(signatureParts.parameterTypes || []).join(', ')});`;
}

ClassArea.prototype.getFieldDescriptor =function (field) {
    let cp = this.getConstantPool();
    let name = cp[field.name_index].bytes;
    let descriptor = cp[field.descriptor_index].bytes;
    return {access_flags: decodeAccessFlags(field.access_flags), name, descriptor, type: decodeDescriptorType(descriptor), signature: decodeSignature(descriptor).returnType, access_flags: field.access_flags, text: createFieldSignature(name, descriptor, field.access_flags)};
}

ClassArea.prototype.getMethodDescriptor =function (method) {
    let cp = this.getConstantPool();
    let name = cp[method.name_index].bytes;
    let descriptor = cp[method.signature_index].bytes;
    return {access_flags: decodeAccessFlags(method.access_flags), name, descriptor, signature: decodeSignature(descriptor), access_flags: method.access_flags, text: createMethodSignature(name, descriptor, method.access_flags)};
}

ClassArea.prototype.getMethodAttributeByName = function(method, attributeName) {

}

function getElementValue(reader) {
    let tag = String.fromCharCode(reader.read8());
    let element_value = { tag };

    switch (tag) {
        case '[':
            element_value.values = [];
            let num_values = reader.read16();
            for (let idx = 0; idx < num_values; idx++) {
                element_value.values.push(getElementValue(reader));
            }
            break;
        case '@':
            element_value.annotation_value = getAnnotation(reader);
            break;
        case 'c':
            element_value.class_info_index = reader.read16();
            break;
        case 'e':
            let type_name_index = reader.read16();
            let const_name_index = reader.read16();
            element_value.enum_const_value = { type_name_index, const_name_index };
            break;
        case 'B':
        case 'C':
        case 'D':
        case 'F':
        case 'I':
        case 'J':
        case 'S':
        case 'Z':
        case 's':
            element_value.const_value_index = reader.read16();
            break;
        default:
            console.error(`element_value tag [${tag}] is not defined`);
        }

    return element_value;
}

function getAnnotation(reader) {
    let annotation = {};
    annotation.type_index = reader.read16();
    let num_element_value_pairs = reader.read16();
    annotation.element_value_pairs = [];
    for (let j = 0; j < num_element_value_pairs; j++) {
        let element_name_index = reader.read16();
        let value = getElementValue(reader);
        annotation.element_value_pairs.push({ element_name_index, value });
    }
    return annotation;
}

function getAnnotations(reader) {
    var num_annotations = reader.read16();
    let annotations = [];
    for (var i = 0; i < num_annotations; i++) {
        annotations.push(getAnnotation(reader));
    }

    return annotations;
}


var getClassImage = function (classBytes) {

    var classImage = {};

    var getAttribues = function (attribute_name_index, bytes) {

        var reader = new Reader.create(bytes);
        var attribute = { attribute_name_index: attribute_name_index };


        var item = classImage.constant_pool[attribute_name_index];


        switch (item.tag) {

            case TAGS.CONSTANT_Long:
            case TAGS.CONSTANT_Float:
            case TAGS.CONSTANT_Double:
            case TAGS.CONSTANT_Integer:
            case TAGS.CONSTANT_String:
                attribute.type = ATTRIBUTE_TYPES.ConstantValue;
                attribute.constantvalue_index = reader.read16();
                return attribute;


            case TAGS.CONSTANT_Utf8:

                switch (item.bytes) {

                    case ATTRIBUTE_TYPES.Code:
                        attribute.type = ATTRIBUTE_TYPES.Code;
                        attribute.max_stack = reader.read16();
                        attribute.max_locals = reader.read16();
                        var code_length = reader.read32();
                        attribute.code = reader.readBytes(code_length);

                        var exception_table_length = reader.read16();
                        attribute.exception_table = [];
                        for (var i = 0; i < exception_table_length; i++) {
                            var start_pc = reader.read16();
                            var end_pc = reader.read16();
                            var handler_pc = reader.read16();
                            var catch_type = reader.read16();
                            attribute.exception_table.push({ start_pc: start_pc, end_pc: end_pc, handler_pc: handler_pc, catch_type: catch_type });
                        }

                        var attributes_count = reader.read16();
                        attribute.attributes = [];
                        for (var i = 0; i < attributes_count; i++) {
                            var attribute_name_index = reader.read16();
                            var attribute_length = reader.read32();
                            var info = reader.readBytes(attribute_length);
                            attribute.attributes.push({ attribute_name_index: attribute_name_index, attribute_length: attribute_length, info: info });
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.SourceFile:
                        attribute.type = ATTRIBUTE_TYPES.SourceFile;
                        attribute.sourcefile_index = reader.read16();
                        return attribute;

                    case ATTRIBUTE_TYPES.Exceptions:
                        attribute.type = ATTRIBUTE_TYPES.Exceptions;
                        var number_of_exceptions = reader.read16();
                        attribute.exception_index_table = [];
                        for (var i = 0; i < number_of_exceptions; i++) {
                            attribute.exception_index_table.push(reader.read16());
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.InnerClasses:
                        attribute.type = ATTRIBUTE_TYPES.InnerClasses;
                        var number_of_classes = reader.read16();
                        attribute.classes = [];
                        for (var i = 0; i < number_of_classes; i++) {
                            var inner = {};
                            inner.inner_class_info_index = reader.read16();
                            inner.outer_class_info_index = reader.read16();
                            inner.inner_name_index = reader.read16();
                            inner.inner_class_access_flags = reader.read16();
                            attribute.classes.push(inner);
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.MethodParameters:
                        attribute.type = ATTRIBUTE_TYPES.MethodParameters;
                        var parameters_count = reader.read8();
                        attribute.parameters = [];
                        for (var i = 0; i < parameters_count; i++) {
                            var parameter_name_index = reader.read16();
                            var parameter_access_flags = reader.read16();
                            attribute.parameters.push({ parameter_name_index, parameter_access_flags });
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.Signature:
                        attribute.type = ATTRIBUTE_TYPES.Signature;
                        attribute.signature_index = reader.read16();
                        return attribute;

                    case ATTRIBUTE_TYPES.BootstrapMethods:
                        attribute.type = ATTRIBUTE_TYPES.BootstrapMethods;
                        var num_bootstrap_methods = reader.read8();
                        attribute.bootstrap_methods = [];
                        for (var i = 0; i < num_bootstrap_methods; i++) {
                            let bootstrap_method_ref = reader.read16();
                            let num_bootstrap_arguments = reader.read16();
                            let bootstrap_arguments = [];
                            for (let j = 0; j < num_bootstrap_arguments; j++) {
                                let bootstrap_argument = reader.read16();
                                bootstrap_arguments.push(bootstrap_argument);
                            }
                            attribute.bootstrap_methods.push({ bootstrap_method_ref, bootstrap_arguments });
                        }
                        return attribute;
                        
                    case ATTRIBUTE_TYPES.RuntimeVisibleAnnotations:
                    case ATTRIBUTE_TYPES.RuntimeInvisibleAnnotations: {
                        attribute.type = item.bytes;
                        attribute.annotations = getAnnotations(reader);
                        return attribute;
                    }
                    case ATTRIBUTE_TYPES.RuntimeVisibleParameterAnnotations:
                    case ATTRIBUTE_TYPES.RuntimeInvisibleParameterAnnotations: {
                        attribute.type = item.bytes;
                        var num_parameters = reader.read8();
                        attribute.parameter_annotations = [];
                        for (var i = 0; i < num_parameters; i++) {
                            attribute.parameter_annotations.push(getAnnotations(reader));
                        }
                        return attribute;
                    }
                    case ATTRIBUTE_TYPES.Deprecated:
                        attribute.type = ATTRIBUTE_TYPES.Deprecated;
                        return attribute;

                    case ATTRIBUTE_TYPES.EnclosingMethod:
                        attribute.type = ATTRIBUTE_TYPES.EnclosingMethod;
                        attribute.class_index = reader.read16();
                        attribute.method_index = reader.read16();
                        return attribute;

                    case ATTRIBUTE_TYPES.AnnotationDefault:
                        attribute.type = ATTRIBUTE_TYPES.AnnotationDefault;
                        attribute.default_value = getElementValue(reader);
                        return attribute;

                    default:
                        throw new Error("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
                }

            default:
                throw new Error("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
        }
    };


    var reader = Reader.create(classBytes);
    classImage.magic = reader.read32().toString(16);

    classImage.version = {
        minor_version: reader.read16(),
        major_version: reader.read16()
    };

    classImage.constant_pool = [null];
    var constant_pool_count = reader.read16();
    for (var i = 1; i < constant_pool_count; i++) {
        var tag = reader.read8();
        switch (tag) {
            case TAGS.CONSTANT_Class:
                var name_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, name_index: name_index });
                break;
            case TAGS.CONSTANT_Utf8:
                var length = reader.read16();
                var bytes = reader.readString(length);
                classImage.constant_pool.push({ tag: tag, bytes: bytes });
                break;
            case TAGS.CONSTANT_Methodref:
                var class_index = reader.read16();
                var name_and_type_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, class_index: class_index, name_and_type_index: name_and_type_index });
                break;
            case TAGS.CONSTANT_NameAndType:
                var name_index = reader.read16();
                var signature_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, name_index: name_index, signature_index: signature_index });
                break;
            case TAGS.CONSTANT_Fieldref:
                var class_index = reader.read16();
                var name_and_type_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, class_index: class_index, name_and_type_index: name_and_type_index });
                break;
            case TAGS.CONSTANT_String:
                var string_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, string_index: string_index });
                break;
            case TAGS.CONSTANT_Float:
                var bytes = reader.readFloat();
                classImage.constant_pool.push({ tag: tag, bytes: bytes });
                break;
            case TAGS.CONSTANT_Integer:
                var bytes = reader.read32();
                classImage.constant_pool.push({ tag: tag, bytes: bytes });
                break;
            case TAGS.CONSTANT_Double:
            case TAGS.CONSTANT_Long:
                var bytes = new Buffer(8);
                for (var b = 0; b < 8; b++) {
                    bytes[b] = reader.read8();
                }
                classImage.constant_pool.push({ tag: tag, bytes: bytes });
                classImage.constant_pool.push(null); i++;
                break;
            case TAGS.CONSTANT_Fieldref:
            case TAGS.CONSTANT_Methodref:
            case TAGS.CONSTANT_InterfaceMethodref:
                var class_index = reader.read16();
                var name_and_type_index = reader.read16();
                classImage.constant_pool.push({ tag: tag, class_index: class_index, name_and_type_index: name_and_type_index });
                break;
            case TAGS.CONSTANT_MethodHandle:
                let reference_kind = reader.read8();
                let reference_index = reader.read16();
                classImage.constant_pool.push({ tag, reference_index, reference_kind });
                break;
            case TAGS.CONSTANT_MethodType:
                let descriptor_index = reader.read16();
                classImage.constant_pool.push({ tag, descriptor_index });
                break;
            case TAGS.CONSTANT_InvokeDynamic:
                let bootstrap_method_attr_index = reader.read16();
                name_and_type_index = reader.read16();
                classImage.constant_pool.push({ tag, bootstrap_method_attr_index, name_and_type_index });
                break;
            default:
                throw new Error(util.format("tag %s is not supported.", tag));
        }
    }

    classImage.access_flags = reader.read16();

    classImage.this_class = reader.read16();

    classImage.super_class = reader.read16();


    classImage.interfaces = [];
    var interfaces_count = reader.read16();
    for (var i = 0; i < interfaces_count; i++) {
        var index = reader.read16();
        if (index != 0) {
            classImage.interfaces.push(index);
        }
    }

    classImage.fields = [];
    var fields_count = reader.read16();
    for (var i = 0; i < fields_count; i++) {
        var access_flags = reader.read16();
        var name_index = reader.read16();
        var descriptor_index = reader.read16();
        var attributes_count = reader.read16();
        var field_info = {
            access_flags: access_flags,
            name_index: name_index,
            descriptor_index: descriptor_index,
            attributes_count: attributes_count,
            attributes: []
        }
        for (var j = 0; j < attributes_count; j++) {
            var attribute_name_index = reader.read16();
            var attribute_length = reader.read32();
            var info = reader.readBytes(attribute_length);
            field_info.attributes.push({ attribute_name_index, attribute_length, info });
        }
        classImage.fields.push(field_info);
    }


    classImage.methods = [];
    var methods_count = reader.read16();
    for (var i = 0; i < methods_count; i++) {
        var access_flags = reader.read16();
        var name_index = reader.read16();
        var signature_index = reader.read16();
        var attributes_count = reader.read16();
        var method_info = {
            access_flags: access_flags,
            name_index: name_index,
            signature_index: signature_index,
            attributes_count: attributes_count,
            attributes: []
        }
        for (var j = 0; j < attributes_count; j++) {
            var attribute_name_index = reader.read16();
            var attribute_length = reader.read32();
            var info = getAttribues(attribute_name_index, reader.readBytes(attribute_length));
            var attribute = {
                attribute_name_index: attribute_name_index,
                attribute_length: attribute_length,
                info: info
            }
            method_info.attributes.push(attribute);
        }

        classImage.methods.push(method_info);
    }


    classImage.attributes = [];
    var attributes_count = reader.read16();
    for (var i = 0; i < attributes_count; i++) {
        var attribute_name_index = reader.read16();
        var attribute_length = reader.read32();
        var info = getAttribues(attribute_name_index, reader.readBytes(attribute_length));
        var attribute = {
            attribute_name_index: attribute_name_index,
            attribute_length: attribute_length,
            info: info
        }
        classImage.attributes.push(attribute);
    }

    return classImage;

};

